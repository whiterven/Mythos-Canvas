import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { StoryConfig, InfographicItem, LoreEntry } from "../types";

// Initialize the client. API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the master story using gemini-3-flash-preview with thinking enabled.
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
  `;

  // --- LORE INJECTION ---
  if (config.lore && config.lore.length > 0) {
      const characters = config.lore.filter(l => l.category === 'Character');
      const locations = config.lore.filter(l => l.category === 'Location');
      const rules = config.lore.filter(l => l.category === 'Rule' || l.category === 'Item');

      prompt += `
      \n*** WORLD BIBLE (STRICT ADHERENCE REQUIRED) ***
      You must strictly adhere to the following established facts. Do not contradict them.

      CHARACTERS:
      ${characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}

      LOCATIONS:
      ${locations.map(l => `- ${l.name}: ${l.description}`).join('\n')}

      RULES/ITEMS:
      ${rules.map(r => `- ${r.name}: ${r.description}`).join('\n')}
      `;
  }
  // -----------------------
  
  prompt += `
  \nSTORY CONFIGURATION:
  `;
  
  if (isContinuation) {
      prompt += `
      TASK: CONTINUE the story. You are writing the NEXT chapter or segment. 
      
      CRITICAL INSTRUCTIONS FOR CONTINUATION:
      1.  Read the "EXISTING CONTENT" below to understand the plot, tone, and current cliffhanger.
      2.  Do NOT rewrite the existing content. Start EXACTLY where it left off.
      3.  Do NOT rush to a conclusion unless the "Ending Type" specifically demands it now. If the user asked for a 20-chapter book and we are on chapter 2, simply write Chapter 3.
      4.  Maintain absolute consistency with the narrative voice established below.
      
      EXISTING CONTENT (The Story So Far):
      """
      ${config.existingContent}
      """
      
      OUTPUT FORMAT:
      Start immediately with the text of the next scene/chapter.
      Example:
      ## Chapter [Next Number]: [Title]
      [Prose...]
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
    - Chapter Count: ${config.chapterCount} (If this is a long book, PACE YOURSELF. Do not fit everything into one response).
    - Key Elements: ${config.keyElements}
    - Complexity: ${config.complexity}
    - Ending Type: ${config.endingType}
    - Constraints: ${config.constraints}

    OUTPUT FORMAT:
    ${isContinuation ? '(See Continuation Instructions above)' : '# [Story Title]\n\n## Chapter 1: [Title]'}
    [Content]
    ...
  `;

  try {
    // Using Gemini 3 Flash Preview as requested
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 16384 }, // Adjusted budget for Flash
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
 * Accepts File, Base64 string, or Array of them.
 */
export const editImage = async (imageInput: File | string | (File|string)[], prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  let inputs: (File|string)[] = [];
  if (Array.isArray(imageInput)) {
      inputs = imageInput;
  } else {
      inputs = [imageInput];
  }

  // Convert all inputs to base64 parts
  const parts: any[] = [];
  
  for (const input of inputs) {
      let base64Data = "";
      let mimeType = "image/png";

      if (input instanceof File) {
        base64Data = await fileToGenerativePart(input);
        mimeType = input.type;
      } else {
        const match = input.match(/^data:(.*?);base64,(.*)$/);
        if (match) {
            mimeType = match[1];
            base64Data = match[2];
        } else {
            base64Data = input;
        }
      }
      
      parts.push({
          inlineData: {
              data: base64Data,
              mimeType: mimeType
          }
      });
  }

  // Add the text prompt
  parts.push({ text: `Edit/Generate based on these images: ${prompt}` });

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: parts,
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
export const editImageVariations = async (imageInput: File | string | (File|string)[], prompt: string, aspectRatio: string = "1:1", count: number = 4): Promise<string[]> => {
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

interface ChartOptions {
    isChart: boolean;
    chartType?: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
}

/**
 * Analyzes text content and structures it into infographic sections.
 */
export const structureInfographicData = async (text: string, style: string, chartOptions?: ChartOptions): Promise<InfographicItem[]> => {
  const isChartMode = chartOptions?.isChart;
  
  let prompt = `
  ROLE: Elite Data Visualization Architect & Information Designer.
  
  OBJECTIVE: Transform the input text into a coherent visual narrative consisting of 4-8 slides/tiles.
  
  INPUT CONTEXT:
  """${text.slice(0, 15000)}"""

  DESIGN AESTHETIC: ${style}
  `;

  if (isChartMode) {
      prompt += `
      MODE: DATA VISUALIZATION (CHARTS)
      Constraint: The user wants to generate ${chartOptions?.chartType || 'Bar'} charts.
      Axis Context: X-Axis should relate to "${chartOptions?.xAxisLabel || 'Categories'}", Y-Axis should relate to "${chartOptions?.yAxisLabel || 'Values'}".

      INSTRUCTIONS:
      1. Extract numerical data or comparetative concepts from the text.
      2. If exact numbers aren't present, estimate plausible representative values based on the context to create a meaningful chart.
      3. Create 4-6 distinct charts that explain different aspects of the text.
      
      VISUAL PROMPT ENGINEERING (for Chart Generation):
      - Create a specific prompt to generate a high-quality ${chartOptions?.chartType} chart.
      - Describe the data points clearly (e.g., "A bar chart showing revenue growth: Q1 10%, Q2 15%...").
      - Specify the visual style: "Clean, minimal vector art, dark background, neon accents" (matching the Design Aesthetic).
      - Ensure the prompt asks for clear axis representations.
      `;
  } else {
      prompt += `
      INSTRUCTIONS:
      1.  **Deconstruct**: Identify the core narrative arc. Is it a linear process, a cycle, a comparison, or a network?
      2.  **Select Concepts**: Choose 4-8 key distinct data points or concepts.
      3.  **Map Relationships**: For each concept, define how it visually relates to the whole.
      4.  **Visualize**: Design a complex visual representation for Nano Banana Pro. Avoid generic icons. Use specific metaphors.

      VISUAL PROMPT ENGINEERING (for Nano Banana Pro):
      -   **Composition**: Define the camera angle (e.g., "Isometric 45-degree", "Top-down blueprint", "Cinematic low-angle").
      -   **Lighting & Atmosphere**: "Volumetric fog", "Studio rim lighting", "Bioluminescent pulses".
      -   **Materiality**: "Glassmorphism", "Brushed titanium", "Hand-drawn ink on parchment".
      -   **Complexity**: "Hyper-detailed", "Intricate circuitry", "Data-dense HUD".
      `;
  }

  prompt += `
  OUTPUT SCHEMA (JSON):
  Return a JSON object with a property "tiles" which is an array of objects.
  Each object has: 
  - "title": Short title of the section.
  - "summary": 1-2 sentence explanation/bullet points.
  - "visualPrompt": The highly detailed image generation prompt.
  `;

  try {
    // Using Gemini 3 Flash Preview as requested
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
        status: 'pending',
        isChart: isChartMode,
        chartType: chartOptions?.chartType
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
    attachmentsBase64?: string[] // Changed to support multiple images
): Promise<{ text: string, generatedImage?: string }> => {
  
  // If user provides images or complex tasks, use Gemini 3 Flash.
  const hasAttachments = attachmentsBase64 && attachmentsBase64.length > 0;
  // If the user specifically requested 2.5 flash in the calling function, we respect that,
  // BUT if attachments are present, we usually upgrade. 
  // Here, we upgrade 'gemini-2.5-flash' to 'gemini-3-flash-preview' if attachments exist.
  const effectiveModel = hasAttachments ? "gemini-3-flash-preview" : model;
  
  // Construct the current message contents
  const currentParts: any[] = [{ text: newMessage }];
  
  if (hasAttachments) {
      attachmentsBase64.forEach(att => {
          // Robust detection for base64
          const cleanData = att.includes(',') ? att.split(',')[1] : att;
          currentParts.push({
              inlineData: {
                  mimeType: "image/jpeg", 
                  data: cleanData
              }
          });
      });
  }

  const systemInstruction = `You are Mythos, an elite creative AI partner in the "Mythos & Canvas" suite. 
    
  YOUR IDENTITY:
  - You are Mythos, a sophisticated AI Muse.
  - You are capable of deep literary reasoning AND vivid visual imagination.
  
  YOUR CAPABILITIES:
  1. STORYTELLING: You are a master storyteller. You don't just summarize; you write prose, dialogue, and narrative depth. You understand pacing, tone, and character voice.
  2. VISUALIZATION: You can generate images. If a user asks to "draw", "create", "generate", or "visualize" something, ALWAYS use the \`generate_image\` tool.
  3. ANALYSIS: You can analyze text and multiple uploaded images (if provided) to give creative feedback.
  
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
        // Enable thinking if using the flash-3 model
        ...(effectiveModel === 'gemini-3-flash-preview' ? { thinkingConfig: { thinkingBudget: 16384 } } : {})
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