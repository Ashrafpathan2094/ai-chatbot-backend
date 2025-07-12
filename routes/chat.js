// const express = require("express");
// const axios = require("axios");
// const authMiddleware = require("../middleware/authMiddleware");
// const router = express.Router();

// const cleanOutput = (text) => {
//   return text.replace(/<[^>]+>/g, "").trim();
// };

// const buildPrompt = (messages) => {
//   return (
//     messages
//       .map((msg) => {
//         const role = msg.user === "user" ? "User" : "Therapist";
//         const text = msg.text?.replace(/<[^>]+>/g, "").trim();
//         return `${role}: ${text}`;
//       })
//       .join("\n") + "\nTherapist:" // signal next expected reply
//   );
// };

// router.post("/chat", async (req, res) => {
//   const { messages, chatId, userId } = req.body;

//   if (!messages) {
//     return res
//       .status(400)
//       .json({ error: "Messages are required in the request body." });
//   }

//   const prompt = buildPrompt(messages);

//   try {
//     const response = await axios.post(
//       // "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
//       "https://api-inference.huggingface.co/models/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
//       {
//         // inputs: `User: ${message}\nAssistant:`,
//         inputs: prompt,
//         parameters: {
//           max_new_tokens: 300,
//           return_full_text: false,
//         },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     const output = response.data[0]?.generated_text?.trim();

//     const cleanedOutput = cleanOutput(output);

//     res.json({
//       response: response.data,
//       message: {
//         role: "Therapist",
//         content: cleanedOutput,
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Error in chat route:",
//       error?.response?.data || error.message
//     );
//     res.status(500).json({
//       error: "An error occurred while processing your request.",
//     });
//   }
// });

// module.exports = router;
const express = require("express");
const axios = require("axios");
const router = express.Router();
const Chat = require("../models/Chat"); // <-- Add this line
const { default: mongoose } = require("mongoose");
const cleanOutput = (text) => text.replace(/<[^>]+>/g, "").trim();

const formatMessagesForGroq = (messages) => {
  return messages.map((msg) => ({
    role: msg.role === "user" ? "user" : "assistant",
    content: cleanOutput(msg.content),
  }));
};

router.post("/chat", async (req, res) => {
  try {
    const { messages, chatId, userId } = req.body;

    if (!userId || !messages) {
      return res.status(400).json({ error: "Missing userId or messages" });
    }

    const systemMessage = {
      role: "system",
      content:
        "You are a compassionate, non-judgmental therapist. Offer supportive, helpful, and kind responses to users seeking emotional help. Avoid giving medical advice. Suggest seeing a professional if necessary.",
    };

    const trimmedMessages = messages.length > 5 ? messages.slice(-5) : messages;
    const formattedMessages = formatMessagesForGroq(trimmedMessages);
    const chatPrompt = [systemMessage, ...formattedMessages];

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        messages: chatPrompt,
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    const assistantReply =
      response.data.choices?.[0]?.message?.content ||
      "I'm here to support you.";
    const newMessage = { role: "assistant", content: assistantReply };

    let chat;
    let shouldGenerateTitle = false;
    let title = "New Conversation";

    if (chatId) {
      // Check if existing chat needs a title
      const existingChat = await Chat.findById(chatId);
      if (!existingChat.title || existingChat.title === "New Conversation") {
        shouldGenerateTitle = true;
      }

      // Update existing chat
      chat = await Chat.findByIdAndUpdate(
        chatId,
        { $push: { messages: newMessage } },
        { new: true }
      );
    } else {
      // New chat always needs a title
      shouldGenerateTitle = true;
    }

    if (shouldGenerateTitle) {
      try {
        const firstUserMessage =
          formattedMessages.find((m) => m.role === "user")?.content || "";
        const firstFewWords = firstUserMessage.split(" ").slice(0, 5).join(" ");
        title = firstFewWords || "New Conversation";

        if (chatId && chat) {
          chat = await Chat.findByIdAndUpdate(
            chatId,
            { $set: { title } },
            { new: true }
          );
        }
      } catch (e) {
        console.error("Simple title generation failed:", e);
      }
    }

    if (!chatId) {
      chat = await Chat.create({
        userId,
        title,
        messages: [...formattedMessages, newMessage],
      });
    }

    res.json({
      reply: assistantReply,
      chatId: chat._id,
      title: chat.title,
      messages: chatId ? "Chat updated" : "New chat created",
    });
  } catch (error) {
    console.error("Error in /chat:", error.response?.data || error.message);
    res.status(500).json({
      error: "Something went wrong.",
      details: error.response?.data || error.message,
    });
  }
});

router.get("/getAllUserChats", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res
        .status(400)
        .json({ error: "userId is required as a query parameter" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    const chats = await Chat.find({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .select("_id title createdAt updatedAt");

    res.json(chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

router.get("/chat/details", async (req, res) => {
  try {
    const { chatId, userId } = req.query;
    if (!chatId || !userId) {
      return res.status(400).json({
        error: "Both chatId and userId are required as query parameters",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(chatId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res.status(400).json({
        error: "Invalid chatId or userId format",
      });
    }
    // Find the specific chat
    const chat = await Chat.findOne({
      _id: new mongoose.Types.ObjectId(chatId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found or doesn't belong to this user",
      });
    }

    res.json(chat);
  } catch (error) {
    console.error("Error fetching chat details:", error);
    res.status(500).json({
      error: "Failed to fetch chat details",
      details: error.message,
    });
  }
});

module.exports = router;
