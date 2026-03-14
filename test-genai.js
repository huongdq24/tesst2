const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({apiKey: 'abc'});
console.log(Object.keys(ai.models));