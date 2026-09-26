import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { Server } from "socket.io";
import dns from "node:dns";
import authRoutes from "./routes/auth.routes.js";
import driverRoutes from "./routes/driver.routes.js";
import rideRoutes from "./routes/ride.routes.js";
import adminRoutes from "./routes/admin.routes.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ ok: true, app: "sawarika-api" });
});
app.use("/auth", authRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server me kuch gadbad hui" });
});

app.use("/drivers", driverRoutes);
app.use("/rides", rideRoutes);
app.use("/admin", adminRoutes);

const server = http.createServer(app);

export const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL },
});

io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);
    socket.on("disconnect", () => console.log("socket disconnected:", socket.id));
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
      console.log("MongoDB connected");
      server.listen(PORT, () => console.log(`API running on port ${PORT}`));
    })
    .catch((err) => {
        console.error("DB connection failed:", err.message);
        process.exit(1);
    });