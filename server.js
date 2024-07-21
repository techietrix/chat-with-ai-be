// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin:  "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);



async function getResponse(prompt) {
    try {
        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });

        return response?.data?.choices?.[0]?.message?.content || 'Unable to find answer'
        // res.json(response.data.choices[0].message);
    } catch (error) {
        console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
        res.status(500).send('Error calling OpenAI API');
    }
}
io.on('connection', (socket) => {
    console.log(`${new Date()} A user connected`);
    socket.on('recognized_speech', (data) => {
        console.log(data);
        processAudio(data)
    });

    async function processAudio(recognizedText) {
        try {
            console.log('Transcription:', recognizedText);
            // const response = `You said: ${recognizedText}`;
            const response = await getResponse(recognizedText)


            const speechResponse = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: "tts-1",
                    input: response,
                    voice: "alloy"
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                }
            );

            const speechFileName = `speech_${Date.now()}.mp3`;
            const speechFilePath = path.join(__dirname, 'temp', speechFileName);
            fs.writeFileSync(speechFilePath, Buffer.from(speechResponse.data));

            socket.emit('receive_audio', {
                audioUrl: `${process.env.BACKEND_URL}/temp/${speechFileName}`,
                transcription: recognizedText,
                response: response
            });

            setTimeout(() => {
                fs.unlinkSync(speechFilePath);
            }, 600000); // 1 minute delay

        } catch (error) {
            console.error('Error processing audio:', error);
            socket.emit('stop_mike')
            //   socket.emit('error', 'Error processing audio: ' + error.message);
        } finally {
            audioBuffer = [];
            silenceStart = null;
            isProcessing = false;
        }
    }

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});


app.use('/temp', express.static(path.join(__dirname, 'temp')));

app.get('/', (req, res) => {
    console.log('welcome')
    res.end('Welcome to AI!')
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
