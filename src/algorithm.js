function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function canDraw(participants) {
  if (participants.length < 2) {
    return { ok: false, reason: 'Añade al menos 2 participantes para sortear.' };
  }

  const familyCounts = new Map();
  for (const person of participants) {
    familyCounts.set(person.familyId, (familyCounts.get(person.familyId) || 0) + 1);
  }

  if (familyCounts.size < 2) {
    return {
      ok: false,
      reason: 'Necesitas al menos 2 familias distintas para que nadie saque a alguien de su propia casa.',
    };
  }

  for (const person of participants) {
    const eligible = participants.filter(
      (other) => other.id !== person.id && other.familyId !== person.familyId,
    );
    if (eligible.length === 0) {
      return {
        ok: false,
        reason: `"${person.name}" no tiene a nadie fuera de su familia a quien regalar.`,
      };
    }
  }

  const assignment = findAssignment(participants, 80);
  if (!assignment) {
    return {
      ok: false,
      reason:
        'No hay un sorteo válido con estas familias. Prueba a mover a alguien de familia o añadir más personas de otros hogares.',
    };
  }

  return { ok: true };
}

export function findAssignment(participants, maxAttempts = 120) {
  if (participants.length < 2) return null;

  const giverOrder = () => shuffle(participants.map((p) => p.id));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const order = giverOrder();
    const usedReceivers = new Set();
    const assignment = {};

    if (backtrack(order, 0, usedReceivers, assignment, participants)) {
      return assignment;
    }
  }

  return null;
}

function backtrack(giverOrder, index, usedReceivers, assignment, participants) {
  if (index === giverOrder.length) return true;

  const giverId = giverOrder[index];
  const giver = participants.find((p) => p.id === giverId);
  const candidates = shuffle(
    participants.filter(
      (receiver) =>
        receiver.id !== giver.id &&
        receiver.familyId !== giver.familyId &&
        !usedReceivers.has(receiver.id),
    ),
  );

  for (const receiver of candidates) {
    assignment[giverId] = receiver.id;
    usedReceivers.add(receiver.id);
    if (backtrack(giverOrder, index + 1, usedReceivers, assignment, participants)) {
      return true;
    }
    usedReceivers.delete(receiver.id);
    delete assignment[giverId];
  }

  return false;
}
