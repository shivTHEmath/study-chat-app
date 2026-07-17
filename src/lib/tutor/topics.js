// Curriculum-aligned topic list, keyed by grade band. Topics overlap heavily
// between NCERT/CBSE (India) and US Common Core, so one shared list per band
// works for both audiences. Topic ids must match question_bank.topic_id
// (see migrations/022_question_bank.sql).

export const TOPIC_BANDS = [
  {
    band: '6-7',
    label: 'Grade 6–7',
    topics: [
      { id: 'fractions-decimals', label: 'Fractions & Decimals', icon: '🍕' },
      { id: 'integers', label: 'Integers', icon: '🌡️' },
      { id: 'ratio-proportion', label: 'Ratio & Proportion', icon: '⚖️' },
      { id: 'percentages', label: 'Percentages', icon: '💯' },
      { id: 'simple-equations', label: 'Simple Equations', icon: '🔢' },
      { id: 'perimeter-area', label: 'Perimeter & Area', icon: '📐' },
      { id: 'data-graphs', label: 'Data & Graphs', icon: '📊' },
    ],
  },
  {
    band: '8-9',
    label: 'Grade 8–9',
    topics: [
      { id: 'linear-equations', label: 'Linear Equations', icon: '📈' },
      { id: 'exponents', label: 'Exponents & Powers', icon: '⚡' },
      { id: 'polynomials', label: 'Polynomials & Factoring', icon: '🧩' },
      { id: 'triangles-circles', label: 'Triangles & Circles', icon: '🔺' },
      { id: 'mensuration', label: 'Surface Area & Volume', icon: '📦' },
      { id: 'probability-stats', label: 'Probability & Statistics', icon: '🎲' },
      { id: 'money-problems', label: 'Money Problems', icon: '🪙' },
    ],
  },
  {
    band: '10-11',
    label: 'Grade 10–11',
    topics: [
      { id: 'quadratics', label: 'Quadratic Equations', icon: '🎯' },
      { id: 'systems-equations', label: 'Systems of Equations', icon: '🔗' },
      { id: 'trigonometry', label: 'Trigonometry', icon: '📡' },
      { id: 'coordinate-geometry', label: 'Coordinate Geometry', icon: '🗺️' },
      { id: 'functions-graphs', label: 'Functions & Graphs', icon: '📉' },
      { id: 'sequences-series', label: 'Sequences & Series', icon: '🪜' },
      { id: 'statistics', label: 'Statistics', icon: '📋' },
    ],
  },
]

// Parses grade text like "7th grade", "Grade 8", "10" → the matching band,
// or null when the grade is missing/unparseable (caller shows all bands).
export function bandForGrade(gradeText) {
  const match = String(gradeText || '').match(/\d+/)
  if (!match) return null
  const grade = Number(match[0])
  if (grade <= 7) return '6-7'
  if (grade <= 9) return '8-9'
  if (grade <= 12) return '10-11'
  return null
}

export function topicById(topicId) {
  for (const band of TOPIC_BANDS) {
    const topic = band.topics.find((t) => t.id === topicId)
    if (topic) return { ...topic, band: band.band }
  }
  return null
}
