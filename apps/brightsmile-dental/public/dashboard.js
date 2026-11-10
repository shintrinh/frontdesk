'use strict';
/* Dental dashboard: recalls first, then booking. Renders itself from
   /api/config, so the same page serves any dental clinic generated from the
   template. No framework, plain fetch. */
const $ = (id) => document.getElementById(id);
let config = null;
let services = [];

const FIELD_LABELS = {
  vehicleYearMakeModel: 'Vehicle (year / make / model)',
  mileage: 'Mileage',
  symptomDescription: 'Symptom description',
  fullName: 'Full name',
  dateOfBirth: 'Date of birth',
  insuranceProvider: 'Insurance provider',
  healthHistory: 'Health history / medications',
  isNewPatient: 'New patient?',
  lastVisitDate: 'Last visit date (optional)',
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function init() {
  config = await api('/api/config');
  const svc = await api('/api/services');
  services = svc.services;
  $('business-name').textContent = config.business.name;
  $('business-meta').textContent = `${config.business.type} · ${config.business.address} · ${config.business.phone} · ${config.business.hours.open}–${config.business.hours.close}`;
  $('service').innerHTML = services.map((s) => {
    const codes = (s.codes || []).join(', ');
    return `<option value="${s.id}">${s.name} (${s.durationMin} min${codes ? ` — ${codes}` : ''})</option>`;
  }).join('');
  $('date').value = todayISO();
  $('date').min = todayISO();
  renderIntake();
  $('service').addEventListener('change', loadSlots);
  $('date').addEventListener('change', loadSlots);
  $('booking-form').addEventListener('submit', submitBooking);
  await loadSlots();
  await refresh();
}

function renderIntake() {
  const wrap = $('intake-fields');
  wrap.innerHTML = '';
  for (const field of config.intakeFields) {
    const label = document.createElement('label');
    label.textContent = FIELD_LABELS[field] || field;
    let input;
    if (field === 'isNewPatient') {
      input = document.createElement('select');
      input.innerHTML = '<option value="true">Yes</option><option value="false">No</option>';
    } else if (field === 'dateOfBirth' || field === 'lastVisitDate') {
      input = document.createElement('input');
      input.type = 'date';
    } else if (field === 'mileage') {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
    } else if (field === 'healthHistory' || field === 'symptomDescription') {
      input = document.createElement('input');
      input.type = 'text';
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = `intake-${field}`;
    if (!(config.intakeOptional || []).includes(field)) input.required = true;
    label.appendChild(input);
    wrap.appendChild(label);
  }
}

async function loadSlots() {
  const serviceId = $('service').value;
  const date = $('date').value;
  if (!serviceId || !date) return;
  try {
    const data = await api(`/api/slots?date=${date}&serviceId=${serviceId}`);
    $('slot').innerHTML = data.closed
      ? '<option value="">Closed that day</option>'
      : data.slots.map((s) => `<option value="${s}">${s}</option>`).join('') || '<option value="">No slots left</option>';
  } catch (err) {
    $('slot').innerHTML = `<option value="">${err.message}</option>`;
  }
}

function readIntake() {
  const intake = {};
  for (const field of config.intakeFields) {
    const el = $(`intake-${field}`);
    if (!el) continue;
    if (field === 'isNewPatient') intake[field] = el.value === 'true';
    else if (el.value !== '') intake[field] = field === 'mileage' ? Number(el.value) : el.value;
  }
  return intake;
}

async function submitBooking(event) {
  event.preventDefault();
  const body = {
    serviceId: $('service').value,
    date: $('date').value,
    startTime: $('slot').value,
    customerName: $('customer-name').value,
    phone: $('phone').value,
    intake: readIntake(),
    channel: $('channel').value,
  };
  try {
    const data = await api('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('booking-out').textContent = `Booked: ${data.booking.id} — ${body.date} ${body.startTime}`;
    await refresh();
    await loadSlots();
  } catch (err) {
    $('booking-out').textContent = `Could not book: ${err.message}`;
  }
}

async function refresh() {
  const date = todayISO();
  const { bookings } = await api(`/api/bookings?date=${date}`);
  const tbody = document.querySelector('#bookings-table tbody');
  tbody.innerHTML = bookings.map((b) => {
    const service = services.find((s) => s.id === b.serviceId);
    const cancel = b.status === 'booked' ? `<button class="secondary" data-cancel="${b.id}">Cancel</button>` : '';
    return `<tr><td>${b.startTime}</td><td>${b.customerName}</td><td>${service ? service.name : b.serviceId}</td><td>${b.phone}</td><td>${b.status}</td><td>${cancel}</td></tr>`;
  }).join('') || '<tr><td colspan="6">No appointments today yet.</td></tr>';
  tbody.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
    await api(`/api/bookings/${btn.dataset.cancel}/cancel`, { method: 'POST' });
    await refresh();
    await loadSlots();
  }));

  const rem = await api('/api/reminders');
  // Recalls get their own panel at the top of the page; confirmations stay here.
  $('recalls').innerHTML = rem.recalls.map((r) => `<p>Recall due: ${r.customerName} — last visit ${r.lastVisitDate} (${r.daysSince} days ago, recall every ${r.recallDays} days) <button class="secondary" data-recall="${r.phone}">Send recall</button></p>`).join('') || '<p class="muted">No patients due for recall right now.</p>';
  $('reminders').innerHTML = rem.confirmations.map((b) => `<p>Confirm: ${b.customerName} — ${b.date} ${b.startTime} (${b.phone}) <button class="secondary" data-send="${b.id}">Send reminder</button></p>`).join('') || '<p class="muted">Nothing due right now.</p>';
  document.querySelectorAll('[data-send]').forEach((btn) => btn.addEventListener('click', async () => {
    await api('/api/reminders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: btn.dataset.send }) });
    await refresh();
  }));
  document.querySelectorAll('[data-recall]').forEach((btn) => btn.addEventListener('click', async () => {
    await api('/api/recalls/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: btn.dataset.recall }) });
    await refresh();
  }));

  const { outbox } = await api('/api/outbox');
  $('outbox').innerHTML = outbox.slice(-10).reverse().map((m) => `<li>[${m.sentAt}] ${m.kind} → ${m.to}: ${m.body}</li>`).join('') || '<li class="muted">No messages sent yet.</li>';
}

init().catch((err) => { document.body.insertAdjacentHTML('beforeend', `<p style="color:red;padding:20px">Failed to load: ${err.message}</p>`); });
