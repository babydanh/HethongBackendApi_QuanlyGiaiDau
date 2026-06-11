
async function test() {
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@baseline.vn', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;

  const res = await fetch('http://localhost:3000/api/v1/tournaments/my', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data.data.slice(0, 2), null, 2));
}

test();
