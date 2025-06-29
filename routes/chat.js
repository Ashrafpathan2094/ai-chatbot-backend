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
const cleanOutput = (text) => text.replace(/<[^>]+>/g, "").trim();

const formatMessagesForGroq = (messages) => {
  return messages.map((msg) => ({
    role: msg.user === "user" ? "user" : "assistant",
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

    if (chatId) {
      // Update existing chat
      chat = await Chat.findByIdAndUpdate(
        chatId,
        { $push: { messages: newMessage } },
        { new: true }
      );
    } else {
      // Create new chat
      chat = await Chat.create({
        userId,
        messages: [...formattedMessages, newMessage],
      });
    }

    res.json({
      reply: assistantReply,
      chatId: chat._id,
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

module.exports = router;
