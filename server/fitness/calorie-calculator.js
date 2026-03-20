const DEFAULT_WEIGHT_KG = 70

function calculateCalories(metValue, weightKg = DEFAULT_WEIGHT_KG, durationSeconds) {
  return metValue * weightKg * (durationSeconds / 3600)
}

module.exports = { calculateCalories, DEFAULT_WEIGHT_KG }
