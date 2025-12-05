import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
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
 * Generates an image from text using gemini-2.5-flash-image (Nano Banana).
 */
export const generateImage = async (prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  try {
    // According to guidelines, use generateContent for Nano Banana models
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
          imageConfig: {
              aspectRatio: aspectRatio
          }
      }
    });

    // Iterate to find the image part in the response
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
};

/**
 * Generates multiple image variations in parallel.
 */
export const generateImageVariations = async (prompt: string, aspectRatio: string = "1:1", count: number = 4): Promise<string[]> => {
  const promises = Array.from({ length: count }, () => generateImage(prompt, aspectRatio));
  
  const results = await Promise.allSettled(promises);
  
  const successful = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<string>).value);
    
  if (successful.length === 0) {
    const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    throw firstError?.reason || new Error("Failed to generate variations");
  }
  
  return successful;
};

/**
 * Edits an image based on a text prompt using gemini-2.5-flash-image (Nano Banana).
 */
export const editImage = async (imageFile: File, prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
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
      config: {
        imageConfig: {
            aspectRatio: aspectRatio
        }
      }
    });
    
    // Iterate to find the image part
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
 * Edits multiple image variations in parallel.
 */
export const editImageVariations = async (imageFile: File, prompt: string, aspectRatio: string = "1:1", count: number = 4): Promise<string[]> => {
  const promises = Array.from({ length: count }, () => editImage(imageFile, prompt, aspectRatio));
  
  const results = await Promise.allSettled(promises);
  
  const successful = results
   .filter(r => r.status === 'fulfilled')
   .map(r => (r as PromiseFulfilledResult<string>).value);

  if (successful.length === 0) {
   const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
   throw firstError?.reason || new Error("Failed to generate variations");
 }
 return successful;
}

/**
 * Tool definition for generating images within the chat
 */
const generateImageTool: FunctionDeclaration = {
  name: "generate_image",
  description: "Generates an image based on a detailed text prompt. Call this function when the user asks to draw, create, or visualize something.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: "The detailed visual description of the image to generate."
      },
      aspectRatio: {
        type: Type.STRING,
        description: "The aspect ratio of the image. Options: '1:1', '16:9', '9:16', '4:3', '3:4'. Defaults to '1:1'."
      }
    },
    required: ["prompt"]
  }
};

/**
 * Chatbot functionality with Multimodal and Tool Support.
 */
export const sendChatMessage = async (
    history: {role: string, parts: {text?: string, inlineData?: {mimeType: string, data: string}}[]}[], 
    newMessage: string,
    model: string = "gemini-2.5-flash",
    attachmentBase64?: string
): Promise<{ text: string, generatedImage?: string }> => {
  
  // If user provides an image, we MUST use gemini-3-pro-preview for analysis as per requirements.
  const effectiveModel = attachmentBase64 ? "gemini-3-pro-preview" : model;
  
  // Construct the current message contents
  const currentParts: any[] = [{ text: newMessage }];
  if (attachmentBase64) {
      currentParts.push({
          inlineData: {
              mimeType: "image/jpeg", // Assuming JPEG for simplicity, or detect from data URI
              data: attachmentBase64.split(',')[1] || attachmentBase64
          }
      });
  }

  try {
    // We cannot use ai.chats.create easily with tool execution loops in a stateless wrapper.
    // So we will use generateContent to handle the single turn with full history context.
    // However, keeping the session alive is better. 
    // Let's stick to the stateless approach for this helper, but reconstruct history carefully.
    
    const contents = [
        ...history,
        { role: 'user', parts: currentParts }
    ];

    const result = await ai.models.generateContent({
      model: effectiveModel,
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [generateImageTool] }]
      }
    });

    const response = result.candidates?.[0]?.content;
    const parts = response?.parts || [];
    
    let finalText = "";
    let generatedImageBase64: string | undefined = undefined;

    // Handle Model Response Parts
    for (const part of parts) {
        if (part.text) {
            finalText += part.text;
        }
        
        // Check for Function Calls
        if (part.functionCall) {
            const fc = part.functionCall;
            if (fc.name === 'generate_image') {
                const args = fc.args as any;
                finalText += `\n\n_(Generating image: ${args.prompt})_\n`;
                
                try {
                    generatedImageBase64 = await generateImage(args.prompt, args.aspectRatio || "1:1");
                } catch (e) {
                    finalText += `\n_(Image generation failed: ${e})_`;
                }
            }
        }
    }

    return {
        text: finalText,
        generatedImage: generatedImageBase64
    };

  } catch (error) {
    console.error(`Chat failed with model ${effectiveModel}:`, error);
    return { text: "I'm having trouble connecting to the AI models right now. Please try again." };
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

/**
 * Rewrite text based on an instruction.
 */
export const rewriteText = async (text: string, instruction: string): Promise<string> => {
  try {
     const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
      TASK: Rewrite the following text based on the instruction. Return ONLY the rewritten text, no commentary.
      
      TEXT: "${text}"
      
      INSTRUCTION: ${instruction}
      `
    });
    return response.text?.trim() || text;
  } catch (e) {
    console.error("Rewrite failed:", e);
    return text;
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