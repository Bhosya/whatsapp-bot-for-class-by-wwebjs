const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const sqlite3 = require("sqlite3").verbose();
const moment = require("moment");

const express = require("express");
const app = express();
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

const db = new sqlite3.Database("./assignments.db", (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      deadline TEXT,
      detail TEXT
    )`);
  }
});

function deleteExpiredAssignments() {
  const currentDate = moment().format("DD-MM-YYYY");
  db.run(`DELETE FROM assignments WHERE deadline < ?`, [currentDate], (err) => {
    if (err) {
      console.error("Failed to delete expired assignments:", err.message);
    }
  });
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "session",
  }),
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.initialize();

client.on("message", async (msg) => {
  if (msg.body.startsWith(".")) {
    const sender = msg.author || msg.from; // Get sender's number
    const contact = await msg.getContact(); // Get contact info (name, etc.)

    // Retrieve username (or fallback to number if no name is set)
    const username = contact.pushname || contact.number || sender;

    console.log(`@${username} used: ${msg.body}`);
  }

  deleteExpiredAssignments();

  if (msg.body === ".help") {
    client.sendMessage(msg.from, "Command yang tersedia:\n\n.tugasbaru <matkul> <deadline> <detail tugas>\n.detailtugas <matkul>\n.listtugas\n.hapustugas <matkul>");
  } else if (msg.body === "@everyone") {
    const chat = await msg.getChat();
    let text = "";
    let mentions = [];

    for (let participant of chat.participants) {
      mentions.push(`${participant.id.user}@c.us`);
      text += `@${participant.id.user} `;
    }

    await chat.sendMessage(text, { mentions });
  } else if (msg.body.startsWith(".tugasbaru ")) {
    const [_, title, deadline, ...detailArr] = msg.body.split(" ");
    const detail = detailArr.join(" ");

    if (moment(deadline, "DD-MM-YYYY", true).isValid() && title && detail) {
      db.run(`INSERT INTO assignments (title, deadline, detail) VALUES (?, ?, ?)`, [title, deadline, detail], (err) => {
        if (err) {
          client.sendMessage(msg.from, "Gagal menambahkan tugas.");
        } else {
          client.sendMessage(msg.from, `Tugas "${title}" dengan deadline "${deadline}" dan detail berhasil ditambahkan.`);
        }
      });
    } else {
      client.sendMessage(msg.from, "Format salah. Gunakan: !tugasbaru <judul tugas> <deadline (dd-mm-yyyy)> <detail>");
    }
  } else if (msg.body.startsWith(".detailtugas ")) {
    const [_, title] = msg.body.split(" ", 2);

    if (title) {
      db.get(`SELECT detail FROM assignments WHERE title = ?`, [title], (err, row) => {
        if (err || !row) {
          client.sendMessage(msg.from, "Tugas tidak ditemukan atau gagal mengambil detail.");
        } else {
          client.sendMessage(msg.from, `Detail tugas "${title}":\n\n${row.detail}`);
        }
      });
    } else {
      client.sendMessage(msg.from, "Format salah. Gunakan: !detailtugas <judul tugas>");
    }
  } else if (msg.body.startsWith(".hapustugas ")) {
    const [_, title] = msg.body.split(" ", 2);

    if (title) {
      db.run(`DELETE FROM assignments WHERE title = ?`, [title], (err) => {
        if (err) {
          client.sendMessage(msg.from, "Gagal menghapus tugas.");
        } else {
          client.sendMessage(msg.from, `Tugas "${title}" telah dihapus.`);
        }
      });
    } else {
      client.sendMessage(msg.from, "Format salah. Gunakan: !hapustugas <judul tugas>");
    }
  } else if (msg.body === ".listtugas") {
    db.all(`SELECT title, deadline FROM assignments`, [], (err, rows) => {
      if (err) {
        client.sendMessage(msg.from, "Gagal mengambil daftar tugas.");
      } else if (rows.length === 0) {
        client.sendMessage(msg.from, "Tidak ada tugas.");
      } else {
        let assignmentsList = "Daftar Tugas:\n";
        rows.forEach((row, index) => {
          assignmentsList += `${index + 1}. ${row.title} - Deadline: ${row.deadline}\n`;
        });
        client.sendMessage(msg.from, assignmentsList);
      }
    });
  }
});
