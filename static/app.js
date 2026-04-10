const form = document.getElementById('auth-form');
const switchModeBtn = document.getElementById('switch-mode');
const confirmGroup = document.getElementById('confirm-group');
const title = document.getElementById('auth-title');
const subtitle = document.getElementById('auth-subtitle');
const submit = document.getElementById('auth-submit');
const message = document.getElementById('auth-message');
const switchCopy = document.getElementById('switch-copy');

let signUpMode = false;

switchModeBtn.addEventListener('click', () => {
  signUpMode = !signUpMode;
  confirmGroup.classList.toggle('hidden', !signUpMode);
  title.textContent = signUpMode ? 'Sign-up' : 'Login';
  subtitle.textContent = signUpMode
    ? '회원가입하여 할 일을 관리하세요!'
    : '계정에 로그인하여 할 일을 관리 하세요!';
  submit.textContent = signUpMode ? 'sign up' : 'login';
  switchModeBtn.textContent = signUpMode ? '로그인' : '회원가입';
  switchCopy.firstChild.textContent = signUpMode
    ? '이미 계정이 있으신가요? '
    : '아직 계정이 없으신가요? ';
  message.textContent = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = form.id.value.trim();
  const password = form.password.value.trim();

  if (signUpMode) {
    const confirmPassword = form.confirmPassword.value.trim();
    if (password !== confirmPassword) {
      message.textContent = '비밀번호가 일치하지 않습니다.';
      return;
    }
  }

  const endpoint = signUpMode ? '/api/signup' : '/api/login';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, password })
  });

  const data = await res.json();
  if (!res.ok) {
    message.textContent = data.error || '요청에 실패했습니다.';
    return;
  }

  localStorage.setItem('dotto_user', JSON.stringify(data.user));
  message.textContent = signUpMode
    ? '회원가입 완료! 로그인합니다.'
    : '로그인 성공!';

  setTimeout(() => {
    window.location.href = '/todolist';
  }, 500);
});
