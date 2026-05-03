// Debug script to check authentication
// Run this in browser console after signing in

console.log('=== Authentication Debug ===');
console.log('Token in localStorage:', localStorage.getItem('token'));
console.log('API Base URL:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

// Test token validity
const token = localStorage.getItem('token');
if (token) {
  fetch('https://angular-recoup-broadness.ngrok-free.dev/chat/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => response.json())
  .then(data => console.log('Chat API Response:', data))
  .catch(error => console.error('Chat API Error:', error));
}
