const fields = {
  targetCups: document.getElementById('targetCups'),
  cupSizeMl: document.getElementById('cupSizeMl'),
  intervalMin: document.getElementById('intervalMin'),
  startHour: document.getElementById('startHour'),
  endHour: document.getElementById('endHour'),
  snoozeMin: document.getElementById('snoozeMin'),
  notificationsEnabled: document.getElementById('notificationsEnabled'),
  form: document.getElementById('form'),
  reset: document.getElementById('reset')
};

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (s) => {
    fields.targetCups.value = s.targetCups;
    fields.cupSizeMl.value = s.cupSizeMl;
    fields.intervalMin.value = s.intervalMin;
    fields.startHour.value = s.startHour;
    fields.endHour.value = s.endHour;
    fields.snoozeMin.value = s.snoozeMin;
    fields.notificationsEnabled.checked = Boolean(s.notificationsEnabled);
  });
}

function savePatch(patch) {
  return new Promise((res) => chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', ...patch }, res));
}

fields.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {
    targetCups: Number(fields.targetCups.value),
    cupSizeMl: Number(fields.cupSizeMl.value),
    intervalMin: Number(fields.intervalMin.value),
    startHour: Number(fields.startHour.value),
    endHour: Number(fields.endHour.value),
    snoozeMin: Number(fields.snoozeMin.value),
    notificationsEnabled: Boolean(fields.notificationsEnabled.checked)
  };
  await savePatch(patch);
  toast('Saved!');
});

fields.reset.addEventListener('click', async () => {
  await savePatch({
    targetCups: 8,
    cupSizeMl: 250,
    intervalMin: 60,
    startHour: 9,
    endHour: 21,
    snoozeMin: 15,
    notificationsEnabled: true
  });
  loadState();
  toast('Defaults restored');
});

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '16px', right: '16px', padding: '10px 12px',
    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px', color: '#e5e7eb', backdropFilter: 'blur(8px)', zIndex: 1000,
    boxShadow: '0 10px 24px rgba(0,0,0,0.25)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

loadState();
