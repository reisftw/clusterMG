const checklist = require("../../../shared/aprChecklist.json");
function invalid(message) { const e = new Error(message); e.status = 400; throw e; }
function validateApr(input) {
 if (!input || typeof input !== "object") invalid("APR inválida.");
 const text = (key, max, required = true) => {
  if (typeof input[key] !== "string" || input[key].trim().length > max || (required && !input[key].trim())) invalid("Preencha corretamente: " + key);
  return input[key].trim();
 };
 const participants = text("participants", 2000);
 const ticket = text("ticket", 100);
 const date = text("date", 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) invalid("Data inválida.");
 const answers = {};
 let status = "sem_impedimento_informado";
 for (const q of checklist.questions) {
  const value = input.answers?.[q.id];
  if (!Number.isInteger(value) || !q.options[value]) invalid("Responda: " + q.label);
  answers[q.id] = value;
  if (q.stop.includes(value)) status = "interromper";
  else if (q.verify.includes(value) && status !== "interromper") status = "verificar";
 }
 const equipment = ["Cinto de segurança", "Talabartes", "Trava-quedas"];
 const checked = input.answers.fallEquipment || [];
 if (!Array.isArray(checked) || checked.some(p => !equipment.includes(p)) || (answers.fallProtection === 0 && equipment.some(p => !checked.includes(p)))) invalid("Confirme os equipamentos de proteção contra quedas verificados.");
 answers.fallEquipment = answers.fallProtection === 0 ? equipment : [];
 const missing = input.missingPpe;
 if (!Array.isArray(missing) || missing.some(p => !checklist.ppe.includes(p))) invalid("Lista de EPIs inválida.");
 if (answers.allPpe === 1 && !missing.length) invalid("Marque os EPIs que não possui.");
 if (answers.allPpe === 0 && missing.length) invalid("Revise os EPIs: informou possuir todos e também marcou itens ausentes.");
 const location = input.location;
 if (!location || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90 || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180 || !Number.isFinite(location.accuracy) || location.accuracy < 0) invalid("Capture uma localização válida.");
 const captured = Date.parse(location.capturedAt);
 if (!Number.isFinite(captured) || Math.abs(Date.now() - captured) > 30 * 60 * 1000) invalid("Capture novamente a localização (validade de 30 minutos).");
 if (input.confirmed !== true) invalid("Confirme a leitura das orientações de segurança.");
 return { participants, ticket, date, answers, missing: [...new Set(missing)], observations: text("observations", 4000, false), location, status };
}
function validatePhoto(file) {
 const b = file.buffer;
 const png = b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg = b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255;
 if ((!png && !jpeg) || file.size > 4194304) invalid("Anexe fotos JPEG ou PNG com até 4 MB.");
 return png ? "image/png" : "image/jpeg";
}
module.exports = { validateApr, validatePhoto };
