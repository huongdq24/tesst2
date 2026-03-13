const { GoogleGenerativeAI } = require('@google/genai');

const ai = new GoogleGenerativeAI({apiKey: 'abc'});
console.log(Object.keys(ai.models));