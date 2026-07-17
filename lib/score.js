// lib/score.js
// Calculadora del Score de Riesgo Vehicular (0-100)
// 100 = vehículo limpio | 0 = altísimo riesgo

/**
 * Calcula el score de riesgo basado en los resultados de los scrapers.
 *
 * @param {Object} sat     - Resultado del scraper SAT Lima
 * @param {Object} apeseg  - Resultado del scraper APESEG
 * @param {Object} mtc     - Resultado del scraper MTC/SUNARP
 * @returns {{ score: number, detalles: Object }}
 */
function calcularScore(sat, apeseg, mtc) {
  let score = 100;
  const penalizaciones = [];

  // ── SAT Lima: Multas ─────────────────────────────────────────────────────
  if (sat?.error) {
    // No penalizar si el servicio no respondió, solo registrar
    penalizaciones.push({ origen: 'SAT', motivo: 'Servicio no disponible', puntos: 0 });
  } else {
    const multas = sat?.multas_impagas || 0;
    if (multas > 0) {
      const penalizacion = Math.min(multas * 5, 30); // máximo -30 por multas
      score -= penalizacion;
      penalizaciones.push({
        origen: 'SAT Lima',
        motivo: `${multas} multa(s) impaga(s)`,
        puntos: -penalizacion,
      });
    }
  }

  // ── APESEG: SOAT ─────────────────────────────────────────────────────────
  if (apeseg?.error) {
    penalizaciones.push({ origen: 'APESEG', motivo: 'Servicio no disponible', puntos: 0 });
  } else {
    if (!apeseg?.soat_vigente) {
      score -= 25;
      penalizaciones.push({
        origen: 'APESEG',
        motivo: 'Sin SOAT vigente',
        puntos: -25,
      });
    }
  }

  // ── MTC / SUNARP ─────────────────────────────────────────────────────────
  if (mtc?.error) {
    penalizaciones.push({ origen: 'MTC', motivo: 'Servicio no disponible', puntos: 0 });
  } else {
    // Papeletas pendientes
    const papeletas = mtc?.papeletas_pendientes || 0;
    if (papeletas > 0) {
      const penalizacion = Math.min(papeletas * 10, 30); // máximo -30
      score -= penalizacion;
      penalizaciones.push({
        origen: 'MTC',
        motivo: `${papeletas} papeleta(s) pendiente(s)`,
        puntos: -penalizacion,
      });
    }

    // Vehículo robado
    if (mtc?.reportado_robado) {
      score -= 50;
      penalizaciones.push({
        origen: 'MTC/PNP',
        motivo: '⚠️ Vehículo reportado como ROBADO',
        puntos: -50,
      });
    }

    // Revisión técnica
    if (mtc?.revision_tecnica_vencida) {
      score -= 15;
      penalizaciones.push({
        origen: 'MTC',
        motivo: 'Revisión técnica vencida',
        puntos: -15,
      });
    }
  }

  // El score nunca baja de 0
  score = Math.max(0, score);

  return {
    score,
    nivel: clasificarNivel(score),
    penalizaciones,
  };
}

/**
 * Clasifica el nivel de riesgo según el score.
 */
function clasificarNivel(score) {
  if (score >= 80) return { emoji: '🟢', texto: 'BAJO RIESGO' };
  if (score >= 55) return { emoji: '🟡', texto: 'RIESGO MODERADO' };
  if (score >= 30) return { emoji: '🟠', texto: 'ALTO RIESGO' };
  return { emoji: '🔴', texto: 'MUY ALTO RIESGO' };
}

module.exports = { calcularScore };
