import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { StoryConfig } from "../types";

// Initialize the client. API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the master story using gemini-2.5-flash with thinking enabled.
 * Uses streaming to provide real-time feedback.
 */
export const generateStoryStream = async (
  config: StoryConfig, 
  onChunk: (text: string) => void
): Promise<string> => {
  const isContinuation = !!config.existingContent;

  let prompt = `You are a master AI storyteller.`;
  
  if (isContinuation) {
      prompt += `
      TASK: CONTINUE the following story. Do not rewrite the existing text provided below, just append the next chapters/segments that logically follow.
      
      EXISTING STORY SO FAR:
      """
      ${config.existingContent}
      """
      
      CONFIGURATION FOR CONTINUATION:
      `;
  } else {
      prompt += `
      TASK: Write a new story based on the following configuration.
      `;
  }

  prompt += `
    1. Core Premise / Direction: ${config.corePremise}
    2. Genre: ${config.genre}
    3. Tone: ${config.tone}
    4. Narrative Style: ${config.narrativeStyle}
    5. Target Audience: ${config.targetAudience}
    6. Length/Structure: ${config.lengthStructure}
    7. Chapter Count: ${config.chapterCount} (CRITICAL: ${isContinuation ? 'Add this many NEW chapters.' : 'Divide the story into exactly this many chapters.'})
    8. Key Elements: ${config.keyElements}
    9. Complexity & Detail: ${config.complexity}
    10. Ending Type: ${config.endingType}
    11. Constraints/Inspirations: ${config.constraints}

    Based on these parameters, please:
    1. Conduct any necessary internal research to ensure factual consistency.
    2. Write a complex, multi-layered narrative story.
    3. Strictly segment the story into ${config.chapterCount} chapters using markdown headers (## Chapter X: Title).
    4. Include Appendices with research footnotes if applicable.
    
    Output Format:
    ${isContinuation ? '## Chapter [Next Number]: [Chapter Title]' : '# [Story Title]\n\n## Chapter 1: [Chapter Title]'}
    [Chapter Content]
    ...
    ## Appendices
    [Details]
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16000 }, 
      },
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      // Accessing chunk.text directly as per guidelines
      const newText = chunk.text;
      if (newText) {
        fullText += newText;
        onChunk(fullText);
      }
    }
    return fullText;
  } catch (error) {
    console.error("Story generation failed:", error);
    throw error;
  }
};

/**
 * Edits an image based on a text prompt using gemini-2.5-flash-image (Nano Banana).
 */
export const editImage = async (imageFile: File, prompt: string): Promise<string> => {
  // Convert File to Base64
  const base64Data = await fileToGenerativePart(imageFile);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: imageFile.type,
            },
          },
          {
            text: `Edit this image: ${prompt}`,
          },
        ],
      },
    });
    
    // Iterate to find the image part
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image generated in response.");
  } catch (error) {
    console.error("Image edit failed:", error);
    throw error;
  }
};

/**
 * Chatbot functionality.
 * Default model is 2.5 Flash, but allows switching to Flash-Lite for speed.
 */
export const sendChatMessage = async (
    history: {role: string, parts: {text: string}[]}[], 
    newMessage: string,
    model: string = "gemini-2.5-flash"
): Promise<string> => {
  try {
    const chat = ai.chats.create({
      model: model,
      history: history,
    });
    
    const response = await chat.sendMessage({ message: newMessage });
    return response.text || "";
  } catch (error) {
    console.error(`Chat failed with model ${model}:`, error);
    
    return "I'm having trouble connecting to the AI models right now. Please try again.";
  }
};

/**
 * Helper to get quick responses using flash
 */
export const quickAnalyze = async (text: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Briefly analyze this concept for a story: ${text}`
        });
        return response.text || "";
    } catch (e) {
        console.error("Quick analyze failed:", e);
        return "";
    }
}

// Helper function to convert File to Base64 string for API
async function fileToGenerativePart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}