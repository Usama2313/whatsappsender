require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function listApprovedTextTemplates(){
  console.log('Fetching approved text templates...');
  const templates = await client.content.v1.contents.list({limit:100});
  const approved = [];
  for(const t of templates){
    // filter only text type
    const hasText = t.types && t.types['twilio/text'];
    if(!hasText) continue;
    try {
      const approval = await client.content.v1.contents(t.sid).approvalRequests.fetch();
      if(approval.whatsapp && approval.whatsapp.status === 'approved'){
        approved.push({sid:t.sid, friendlyName:t.friendlyName});
      }
    } catch(e){
      // ignore errors
    }
  }
  console.log('Approved text templates:', approved);
}

listApprovedTextTemplates().catch(console.error);
