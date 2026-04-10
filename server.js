const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const app = express();
const SCRYPT_KEYLEN = 64;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dotto',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

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

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(100) PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      done TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id VARCHAR(100) PRIMARY KEY,
      display_name VARCHAR(255),
      status_message TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [passwordHashColumn] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'`
  );

  if (!passwordHashColumn.length) {
    await pool.query('ALTER TABLE users ADD COLUMN password_hash TEXT NULL');
  }

  const [legacyPasswordColumn] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'`
  );

  if (legacyPasswordColumn.length) {
    const [legacyRows] = await pool.query(
      'SELECT id, password FROM users WHERE password IS NOT NULL AND (password_hash IS NULL OR password_hash = "")'
    );

    for (const row of legacyRows) {
      const upgradedHash = hashPassword(row.password);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [upgradedHash, row.id]);
    }
  }
}

app.post('/api/signup', async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ error: '입력값이 부족합니다.' });

    const passwordHash = hashPassword(password);
    await pool.query('INSERT INTO users(id, password_hash) VALUES (?, ?)', [id, passwordHash]);
    return res.status(201).json({ user: { id } });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: '이미 존재하는 계정입니다.' });
    }
    return res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { id, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    const row = rows[0];

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
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [upgradedHash, id]);
    }

    return res.json({ user: { id: row.id } });
  } catch (err) {
    return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const { userId } = req.query;
    const [rows] = await pool.query(
      'SELECT id, content, done, created_at FROM tasks WHERE user_id = ? ORDER BY id DESC',
      [userId]
    );
    return res.json(rows || []);
  } catch (err) {
    return res.status(500).json({ error: '조회 실패' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { userId, content } = req.body;
    const [result] = await pool.query('INSERT INTO tasks(user_id, content) VALUES (?, ?)', [userId, content]);
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return res.status(500).json({ error: '추가 실패' });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { done } = req.body;
    await pool.query('UPDATE tasks SET done = ? WHERE id = ?', [done, req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '수정 실패' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '삭제 실패' });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT user_id, display_name, status_message FROM profiles WHERE user_id = ?',
      [req.query.userId]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: '조회 실패' });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const { userId, displayName, statusMessage } = req.body;
    await pool.query(
      `INSERT INTO profiles (user_id, display_name, status_message)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         status_message = VALUES(status_message),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, displayName, statusMessage]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '저장 실패' });
  }
});

const PORT = process.env.PORT || 3000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Dotto server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err.message);
    process.exit(1);
  });
