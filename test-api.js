const axios = require('axios');

console.log('🏎️  Testing OpenF1 API...\n');

const api = axios.create({
  baseURL: 'https://api.openf1.org/v1',
  timeout: 10000,
  headers: { 'User-Agent': 'ioBroker.f1-test' }
});

async function testNextRace() {
  try {
    const now = new Date().toISOString();
    console.log('📅 Fetching next race...');
    console.log('   Current time:', now);
    
    const response = await api.get('/sessions', {
      params: {
        session_name: 'Race',
        date_start_gte: now,
        year: new Date().getFullYear()
      }
    });

    if (response.data && response.data.length > 0) {
      const sorted = response.data.sort((a, b) => 
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime()
      );
      const nextRace = sorted[0];

      console.log('\n✅ Next Race Found!\n');
      console.log('Circuit:', nextRace.circuit_short_name);
      console.log('Country:', nextRace.country_name);
      console.log('Location:', nextRace.location);
      console.log('Date:', nextRace.date_start);
      
      const raceDate = new Date(nextRace.date_start);
      const daysUntil = Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      console.log('Days until race:', daysUntil);
      
      console.log('\n📊 Full race data:');
      console.log(JSON.stringify(nextRace, null, 2));
      
      console.log('\n✅ API TEST SUCCESSFUL!');
    } else {
      console.log('⚠️  No upcoming races found');
    }
  } catch (error) {
    console.error('❌ API TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testNextRace();
