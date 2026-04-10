# Dotto (Legacy HTML/CSS/JS + Express + SQLite)

## 권장 폴더 구조

```text
project/
├── templates/
│   ├── index.html
│   ├── todolist.html
│   └── mypage.html
├── static/
│   ├── styles.css
│   ├── app.js
│   ├── todolist.js
│   └── mypage.js
├── server.js
├── schema.sql
├── package.json
└── README.md
```

## Google Colab에서 실행 순서

```bash
cd /content/project
npm install
node server.js
```

## 접속 URL

- `http://localhost:3000/` -> 로그인/회원가입
- `http://localhost:3000/todolist` -> Todo List
- `http://localhost:3000/mypage` -> MyPage

## 경로 규칙

- HTML 템플릿은 `templates/`에서 `sendFile`로 제공됩니다.
- 정적 리소스(CSS/JS)는 `/static/*` 경로로 제공됩니다.
- DB 파일(`dotto.db`)은 `server.js` 위치에 생성됩니다.
