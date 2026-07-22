const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms and users
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // When a user joins a room
    socket.on('join-room', ({ roomId, userName }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        // Add user to room list
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }
        rooms[roomId].push({
            id: socket.id,
            name: userName
        });

        // Tell the new user about existing users in the room
        const otherUsers = rooms[roomId].filter(user => user.id !== socket.id);
        socket.emit('existing-users', otherUsers);

        // Tell other users that a new user joined
        socket.to(roomId).emit('user-joined', {
            id: socket.id,
            name: userName
        });

        console.log(`${userName} joined room: ${roomId}`);
    });

    // Relay WebRTC signaling data
    socket.on('signal', ({ to, data }) => {
        io.to(to).emit('signal', {
            from: socket.id,
            data: data
        });
    });

    // When user disconnects
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter(user => user.id !== socket.id);
            
            // Notify others
            socket.to(roomId).emit('user-left', socket.id);

            // Clean up empty rooms
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
