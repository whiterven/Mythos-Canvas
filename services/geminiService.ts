import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type, SchemaType } from "@google/genai";
import { StoryConfig, InfographicItem } from "../types";

// Initialize the client. API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the master story using gemini-3-pro-preview with thinking enabled.
 * Uses streaming to provide real-time feedback.
 */
export const generateStoryStream = async (
  config: StoryConfig, 
  onChunk: (text: string) => void
): Promise<string> => {
  const isContinuation = !!config.existingContent;

  let prompt = `
  SYSTEM OVERRIDE: HUMAN AUTHOR MODE
  You are an elite human novelist, not an AI. Your prose is visceral, original, and deeply grounded in sensory experience. You are writing a bestseller.

  MANDATE:
  1.  **NO ROBOTICISMS**: Strictly forbid phrases like "testament to," "tapestry of," "symphony of," "realm of," "unbeknownst," "echoes of," "dance of." If you find yourself using a cliché, stop and rewrite it with fresh, specific imagery.
  2.  **DEEP REASONING**: Use your thinking budget to construct complex character psyches and intricate plot architectures before writing a single word of prose.
  3.  **SUBTEXT OVER EXPOSITION**: Never explain what a character feels. Show it through micro-expressions, environment, and action.
  4.  **VOICE**: Your narrative voice should be distinct, opinionated, and colored by the POV character's bias.
  5.  **PROFESSIONALISM**: Assume the reader is sophisticated. Do not hold their hand. Do not summarize the moral at the end.
  6.  **CREATIVITY**: Be bold. Take narrative risks. Surprise the reader with unexpected metaphors and plot turns.

  THINKING PROCESS:
  -   Deconstruct the premise into thematic contradictions.
  -   Plan the scene beats for maximum emotional impact.
  -   Select specific, non-generic details (e.g., instead of "a bird," describe "a molting crow pecking at a bottle cap").

  STORY CONFIGURATION:
  `;
  
  if (isContinuation) {
      prompt += `
      TASK: CONTINUE the following story. Match the existing tone and style perfectly, but elevate the prose quality if needed.
      
      EXISTING CONTENT:
      """
      ${config.existingContent}
      """
      `;
  } else {
      prompt += `
      TASK: Write a brand new story from scratch.
      `;
  }

  prompt += `
    PARAMETERS:
    - Core Premise: ${config.corePremise}
    - Genre: ${config.genre}
    - Tone: ${config.tone}
    - Narrative Style: ${config.narrativeStyle}
    - Target Audience: ${config.targetAudience}
    - Length/Structure: ${config.lengthStructure}
    - Chapter Count: ${config.chapterCount} (Segment strictly into this many chapters).
    - Key Elements: ${config.keyElements}
    - Complexity: ${config.complexity}
    - Ending Type: ${config.endingType}
    - Constraints: ${config.constraints}

    OUTPUT FORMAT:
    ${isContinuation ? '## Chapter [Next]: [Title]' : '# [Story Title]\n\n## Chapter 1: [Title]'}
    [Content]
    ...
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }, 
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
 * Accepts File or Base64 string.
 */
export const editImage = async (imageInput: File | string, prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  let base64Data = "";
  let mimeType = "image/png";

  if (imageInput instanceof File) {
    base64Data = await fileToGenerativePart(imageInput);
    mimeType = imageInput.type;
  } else {
    // Handle base64 string
    const match = imageInput.match(/^data:(.*?);base64,(.*)$/);
    if (match) {
        mimeType = match[1];
        base64Data = match[2];
    } else {
        base64Data = imageInput; // Assume raw base64 if no prefix
    }
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
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
export const editImageVariations = async (imageInput: File | string, prompt: string, aspectRatio: string = "1:1", count: number = 4): Promise<string[]> => {
  const promises = Array.from({ length: count }, () => editImage(imageInput, prompt, aspectRatio));
  
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
 * Analyzes text content and structures it into infographic sections.
 */
export const structureInfographicData = async (text: string, style: string): Promise<InfographicItem[]> => {
  const prompt = `
  ROLE: Elite Data Visualization Architect & Information Designer.
  
  OBJECTIVE: Transform the input text into a coherent visual narrative consisting of 4-8 high-fidelity infographic tiles.
  
  INPUT CONTEXT:
  """${text.slice(0, 15000)}"""

  DESIGN AESTHETIC: ${style}

  INSTRUCTIONS:
  1.  **Deconstruct**: Identify the core narrative arc or logical structure of the text (e.g., Problem -> Solution, Chronological Evolution, Component Breakdown).
  2.  **Select Concepts**: Choose 4-8 key distinct data points, concepts, or steps that drive this narrative.
  3.  **Visualize**: For each concept, design a specific, complex visual representation. Avoid generic icons. Think in terms of:
      -   *Systems*: Network graphs, circuit schematics, ecosystem webs.
      -   *Spatial*: Isometrics, cutaways, cross-sections, exploded views.
      -   *Comparisons*: Split-screens, before/after blends, scale juxtapositions.
      -   *Metaphors*: Visual analogies (e.g., "A crumbling bridge" for unstable infrastructure).

  VISUAL PROMPT ENGINEERING (for Nano Banana Pro):
  -   **Camera & Framing**: Specify the view (e.g., "Low-angle cinematic", "Top-down architectural blueprint", "Macro lens depth of field").
  -   **Lighting**: Define the mood (e.g., "Bioluminescent glow in dark void", "Harsh industrial floodlights", "Soft warm studio lighting").
  -   **Materiality**: Describe textures (e.g., "Matte plastic", "Brushed aluminum", "Rough watercolor paper").
  -   **Complexity**: Demand high detail. Use keywords like "intricate", "hyper-detailed", "data-rich".
  -   **Text Handling**: The AI cannot spell. Describe text/labels as "abstract data overlays", "floating UI elements", or "illegible glyphs".

  OUTPUT SCHEMA (JSON):
  Return a JSON object with a property "tiles" which is an array of objects.
  Each object has: "title", "summary", "visualPrompt".
  `;

  try {
    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    tiles: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                summary: { type: Type.STRING },
                                visualPrompt: { type: Type.STRING }
                            },
                            required: ["title", "summary", "visualPrompt"]
                        }
                    }
                }
            }
        }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No JSON response");
    
    const data = JSON.parse(jsonText);
    
    // Map to internal structure
    return data.tiles.map((t: any, i: number) => ({
        id: `info-${Date.now()}-${i}`,
        title: t.title,
        summary: t.summary,
        visualPrompt: t.visualPrompt,
        status: 'pending'
    }));

  } catch (e) {
      console.error("Failed to structure infographic:", e);
      throw e;
  }
};

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

  const systemInstruction = `You are Mythos, an elite creative AI partner in the "Mythos & Canvas" suite. 
    
  YOUR IDENTITY:
  - You are Mythos, a sophisticated AI Muse.
  - You are capable of deep literary reasoning AND vivid visual imagination.
  
  YOUR CAPABILITIES:
  1. STORYTELLING: You are a master storyteller. You don't just summarize; you write prose, dialogue, and narrative depth. You understand pacing, tone, and character voice.
  2. VISUALIZATION: You can generate images. If a user asks to "draw", "create", "generate", or "visualize" something, ALWAYS use the \`generate_image\` tool.
  3. ANALYSIS: You can analyze text and uploaded images (if provided) to give creative feedback.
  
  GUIDELINES:
  - When writing stories, aim for literary quality unless asked otherwise. Use "Show, Don't Tell".
  - If the user asks for an image, do not just describe it; call the tool to generate it.
  - Be helpful, creative, and professional.
  `;

  try {
    const contents = [
        ...history,
        { role: 'user', parts: currentParts }
    ];

    const result = await ai.models.generateContent({
      model: effectiveModel,
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [generateImageTool] }],
        systemInstruction: systemInstruction,
        // Enable thinking if using the pro model
        ...(effectiveModel === 'gemini-3-pro-preview' ? { thinkingConfig: { thinkingBudget: 32768 } } : {})
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