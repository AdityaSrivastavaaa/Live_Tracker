const express = require('express');
const app = express();
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;


app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

let users = {};

io.on("connection", (socket) => {

    socket.on("send-location", (data) => {
        users[socket.id] = data;

        io.emit("receive-location", {
            id: socket.id,
            ...data
        });

        io.emit("users-list", users);
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("user-disconnected", socket.id);
        io.emit("users-list", users);
    });
});

app.get('/', (req, res) => {
    res.render("index");
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});