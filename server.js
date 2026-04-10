const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'dotto.db'));
const SCRYPT_KEYLEN = 64;

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/todolist', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'todolist.html'));
});

app.get('/mypage', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'mypage.html'));
});

app.get('/todolist.html', (req, res) => {
  res.redirect('/todolist');
});

app.get('/mypage.html', (req, res) => {
  res.redirect('/mypage');
});

// bootstrap tables
const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  status_message TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`;
db.exec(schemaSql);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, savedHash) {
  if (!savedHash || !savedHash.includes(':')) return false;
  const [salt, originalHash] = savedHash.split(':');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(originalHash, 'hex'));
}

function migrateLegacyPasswords() {
  db.all('PRAGMA table_info(users)', (err, columns) => {
    if (err || !columns) return;
    const hasLegacyPassword = columns.some((col) => col.name === 'password');
    const hasPasswordHash = columns.some((col) => col.name === 'password_hash');
    if (!hasLegacyPassword || hasPasswordHash) return;

    db.serialize(() => {
      db.run('ALTER TABLE users ADD COLUMN password_hash TEXT');
      db.all('SELECT id, password FROM users', (selectErr, rows) => {
        if (selectErr || !rows) return;
        rows.forEach((row) => {
          const hashed = hashPassword(row.password);
          db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, row.id]);
        });
      });
    });
  });
}

migrateLegacyPasswords();

app.post('/api/signup', (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ error: '입력값이 부족합니다.' });
  const passwordHash = hashPassword(password);

  db.run('INSERT INTO users(id, password_hash) VALUES (?, ?)', [id, passwordHash], (err) => {
    if (err) return res.status(409).json({ error: '이미 존재하는 계정입니다.' });
    return res.status(201).json({ user: { id } });
  });
});

app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: '서버 오류' });
    if (!row) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const verifiedByHash = row.password_hash && verifyPassword(password, row.password_hash);
    const verifiedByLegacy = row.password && row.password === password;
    if (!verifiedByHash && !verifiedByLegacy) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (!verifiedByHash && verifiedByLegacy) {
      const upgradedHash = hashPassword(password);
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [upgradedHash, id]);
    }
    return res.json({ user: { id: row.id } });
  });
});

app.get('/api/tasks', (req, res) => {
  const { userId } = req.query;
  db.all(
    'SELECT id, content, done, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '조회 실패' });
      return res.json(rows || []);
    }
  );
});

app.post('/api/tasks', (req, res) => {
  const { userId, content } = req.body;
  db.run('INSERT INTO tasks(user_id, content) VALUES (?, ?)', [userId, content], function onInsert(err) {
    if (err) return res.status(500).json({ error: '추가 실패' });
    return res.status(201).json({ id: this.lastID });
  });
});

app.patch('/api/tasks/:id', (req, res) => {
  const { done } = req.body;
  db.run('UPDATE tasks SET done = ? WHERE id = ?', [done, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: '수정 실패' });
    return res.json({ ok: true });
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: '삭제 실패' });
    return res.json({ ok: true });
  });
});

app.get('/api/profile', (req, res) => {
  db.get(
    'SELECT user_id, display_name, status_message FROM profiles WHERE user_id = ?',
    [req.query.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: '조회 실패' });
      return res.json(row || null);
    }
  );
});

app.post('/api/profile', (req, res) => {
  const { userId, displayName, statusMessage } = req.body;
  const sql = `
    INSERT INTO profiles (user_id, display_name, status_message, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id)
    DO UPDATE SET
      display_name = excluded.display_name,
      status_message = excluded.status_message,
      updated_at = CURRENT_TIMESTAMP
  `;

  db.run(sql, [userId, displayName, statusMessage], (err) => {
    if (err) return res.status(500).json({ error: '저장 실패' });
    return res.json({ ok: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dotto server running on http://localhost:${PORT}`);
});
