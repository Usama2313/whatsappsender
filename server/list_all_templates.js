require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function listAllTemplates(){
  console.log('=== Listing all templates (including unapproved) ===');
  const templates = await client.content.v1.contents.list({limit:200});
  for(const t of templates){
    const types = Object.keys(t.types||{}).join(', ');
    let status = 'unknown';
    try{
      const appr = await client.content.v1.contents(t.sid).approvalRequests.fetch();
      status = appr?.whatsapp?.status || 'unknown';
    }catch(e){}
    console.log(`[${status.toUpperCase()}] ${t.friendlyName || 'unnamed'} | ${t.sid} | Types: ${types}`);
  }
}

listAllTemplates().catch(console.error);
