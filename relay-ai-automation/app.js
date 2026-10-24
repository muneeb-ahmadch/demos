// Browser-only product walkthrough. No network requests, storage, AI calls or platform writes.
const source = {
  title: 'Invoice export and billing access',
  id: 'billing-invoices',
  version: '0e97b35d8f602aa417f54af5f2fe91cd7a26b31beee23db0327066366e947158',
  quote: 'A billing administrator can export a paid invoice PDF from Settings → Billing → Invoices. Select the invoice and choose Download PDF. Invoice export is available after payment is settled.'
};
const supportedDraft = `Thanks for reaching out. Our approved guide says:\n\n${source.quote} [1]`;
const scenarios = {
  supported: { id:'RELAY-001', initials:'AM', name:'Alex Morgan', subject:'Download a paid invoice', question:'Where can a billing administrator export a paid invoice PDF once payment is settled?', draft:supportedDraft, takeaway:'One place to check the answer and authorise the next step.' },
  missing: { id:'RELAY-002', initials:'SR', name:'Sam Rivera', subject:'A hosting region the policy does not cover', question:'Can our entire workspace be hosted exclusively in a dedicated region in Antarctica with a private satellite uplink?', draft:'I’m passing this to a teammate so we can give you a verified answer.', takeaway:'A missing answer becomes a visible exception for a person to resolve.' },
  recovery: { id:'RELAY-003', initials:'AM', name:'Alex Morgan', subject:'Download a paid invoice', question:'Where can a billing administrator export a paid invoice PDF once payment is settled?', draft:supportedDraft, takeaway:'Recover the failed contact action while keeping the completed Slack handoff intact.' }
};
let selected = 'supported';
let phase = 'review';
const $ = id => document.getElementById(id);
const text = (id,value) => { $(id).textContent = value; };
function el(tag,className,content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function renderProgress() {
  const complete = phase === 'complete';
  const approved = ['approved','retry','complete'].includes(phase);
  const labels = ['Receive','Find evidence','Review','Handoff'];
  const list = $('progress'); list.replaceChildren();
  labels.forEach((label,index) => {
    const done = index < 2 || (index === 2 && approved) || (index === 3 && complete);
    const current = index === (approved ? 3 : 2);
    const node = el('li',done ? 'done' : current ? (selected === 'missing' ? 'held' : 'current') : '');
    node.append(el('span','step',done ? '✓' : String(index + 1).padStart(2,'0')),el('span','',label));
    if (current && !complete) node.setAttribute('aria-current','step');
    list.append(node);
  });
}
function action(icon,app,title,description) {
  const row = el('div','action-card');
  const copy = el('div'); copy.append(el('strong','',title),el('p','',description));
  row.append(el('span',`app-icon${app === 'slack' ? ' purple' : ''}`,icon),copy);
  return row;
}
function receipt(name,status,attempts,isRetry=false) {
  const row = el('div',`result${isRetry ? ' retry' : ''}`);
  const copy = el('div'); copy.append(el('strong','',name),el('small','',`${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} · simulated`));
  row.append(copy,el('span','',status)); return row;
}
function render() {
  const item = scenarios[selected];
  const held = selected === 'missing';
  const approved = phase !== 'review';
  document.querySelectorAll('[data-scenario]').forEach(button => {
    const active = button.dataset.scenario === selected;
    button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active));
  });
  text('avatar',item.initials); text('customer',item.name); text('subject',item.subject);
  text('question',item.question); text('draft',item.draft); text('example-id',`DEMO / ${item.id}`);
  text('draft-label',held ? 'Held response example' : 'Recorded Claude example');
  const badge = $('case-status');
  badge.className = `badge${held ? ' yellow' : phase === 'complete' ? ' green' : ''}`;
  badge.textContent = held ? 'Needs context' : ({review:'Ready for review',approved:'Approved',retry:'Delivery retry',complete:'Handoffs complete'})[phase];
  const sourceBody = $('source-body'); sourceBody.replaceChildren();
  if (held) {
    sourceBody.append(el('strong','','No approved source covers this request.'),el('p','','The workflow has no evidence for the requested hosting region and satellite uplink. It holds the request for internal review.'));
  } else {
    sourceBody.append(el('strong','',source.title),el('blockquote','',source.quote),el('small','',`SOURCE ${source.id} · VERSION ${source.version}`));
  }
  text('why',held ? 'The available knowledge does not support this request. Approval is disabled; no CRM action or Slack handoff is released.' : 'Claude selected this policy in a recorded application run. The service assembled the exact excerpt into the draft.');
  renderProgress();
  const actions = $('action-list'); actions.replaceChildren();
  const results = $('delivery-results'); results.replaceChildren(); results.hidden = true;
  const advance = $('advance'); advance.disabled = held || phase === 'complete';
  if (held) {
    text('decision-title','Keep the exception in view.');
    text('decision-description','A person needs to add or correct the knowledge before this request can proceed.');
    const hold = el('div','hold-card'); hold.append(el('strong','','Held for internal review'),document.createTextNode('No external notification is sent. The fallback text remains a draft for a teammate.'));
    actions.append(hold);
    advance.textContent = 'Held — more context needed';
    text('action-note','Choose another example to explore approval and delivery.');
    text('event-status','Missing evidence → held for a person. External actions: 0.');
  } else {
    actions.append(
      action('↗','hubspot','HubSpot · Contact identity','Create or match the contact by email. No deal, owner or lifecycle changes.'),
      action('#','slack','Slack · Reviewed team handoff','Share the reviewed draft and customer question with the team. No customer email is sent.')
    );
    if (phase === 'review') {
      text('decision-title','You review. Then the tools act.');
      text('decision-description','Check the source and the draft. Approval releases only the two actions below.');
      advance.textContent = 'Approve demo handoff →';
      text('event-status','A sourced draft is waiting for a person to review.');
    } else if (phase === 'approved') {
      text('decision-title','The approved actions are queued.');
      text('decision-description','The reviewed plan is approved. The worker can now attempt the two handoffs.');
      advance.textContent = selected === 'recovery' ? 'Try demo deliveries →' : 'Complete demo handoffs →';
      text('event-status','Approval recorded in this walkthrough. Two demo actions are ready.');
    } else if (phase === 'retry') {
      text('decision-title','Retry the action that failed.');
      text('decision-description','The HubSpot example returned a rate limit. Slack already succeeded, so its handoff stays complete.');
      results.hidden = false;
      results.append(receipt('HubSpot','Retry · 429',1,true),receipt('Slack','Delivered',1),el('p','delivery-caption','Simulated rate limit. The application schedules a retry after two seconds; this walkthrough lets you advance it manually.'));
      advance.textContent = 'Retry HubSpot only →';
      text('event-status','Simulated HTTP 429 → HubSpot retry pending. Slack completed in one attempt.');
    } else {
      text('decision-title','Both handoffs are accounted for.');
      text('decision-description','The approved actions are complete in this walkthrough. Their individual delivery histories remain visible.');
      results.hidden = false;
      results.append(receipt('HubSpot','Delivered',selected === 'recovery' ? 2 : 1),receipt('Slack','Delivered',1),el('p','delivery-caption','Demonstration receipts. No SaaS accounts were accessed and no customer reply was sent.'));
      advance.textContent = 'Demo handoffs complete ✓';
      text('event-status',selected === 'recovery' ? 'Recovered: HubSpot 2 attempts, Slack 1 attempt. Customer reply remains a draft.' : 'Two simulated handoffs complete. Customer reply remains a draft.');
    }
    text('action-note',approved ? 'The customer reply remains a draft. All receipts here are simulated.' : 'Approval covers only the two actions shown. The customer reply remains a draft.');
  }
  $('takeaway').querySelector('p').textContent = item.takeaway;
}
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click',() => {
  selected = button.dataset.scenario; phase = 'review'; $('source-details').open = false; render();
}));
$('advance').addEventListener('click',() => {
  if (selected === 'missing' || phase === 'complete') return;
  phase = phase === 'review' ? 'approved' : phase === 'approved' && selected === 'recovery' ? 'retry' : 'complete';
  render();
});
$('reset').addEventListener('click',() => { phase = 'review'; render(); });
render();
