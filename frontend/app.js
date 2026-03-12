async function pingAPI() {
  const res = await fetch("http://localhost:8787");
  const data = await res.text();
  alert(data);
}
