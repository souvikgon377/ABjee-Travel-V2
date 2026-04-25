async function testAPI() {
  try {
    const res = await fetch('http://localhost:3000/api/places?search=goa');
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}
testAPI();
