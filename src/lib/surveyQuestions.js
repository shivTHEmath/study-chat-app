export const SURVEY_QUESTIONS = [
  {
    id: 'gender',
    label: 'What is your gender?',
    type: 'select',
    options: ['Male', 'Female', 'Other', 'Prefer not to say'],
  },
  {
    id: 'grade',
    label: 'What grade or standard are you currently in?',
    type: 'scale',
    min: 7,
    max: 10,
    minLabel: '',
    maxLabel: '',
    allowSkip: true,
  },
  {
    id: 'outside_tutoring',
    label:
      'In a typical week, how many days do you attend private tutoring or take classes for mathematics outside of school?',
    type: 'scale',
    min: 0,
    max: 7,
    minLabel: 'Never',
    maxLabel: 'Every day, including weekends',
    allowSkip: true,
  },
  {
    id: 'help_access',
    label:
      "When you don't understand a mathematics homework problem, how easy is it for you to get help?",
    type: 'select',
    options: [
      'Very easy — someone is almost always available',
      'Somewhat easy',
      'Somewhat difficult',
      'Very difficult — I usually have no one to ask',
      'Prefer not to say',
    ],
  },
  {
    id: 'class_enjoyment',
    label: 'How much do you enjoy your mathematics class?',
    type: 'scale',
    min: 1,
    max: 5,
    minLabel: 'Not at all',
    maxLabel: 'A lot',
    allowSkip: true,
  },
  {
    id: 'participation',
    label:
      'How often do you participate in your mathematics class (answering or asking questions, joining discussions)?',
    type: 'scale',
    min: 1,
    max: 5,
    minLabel: 'Rarely',
    maxLabel: 'Very often',
    allowSkip: true,
  },
  {
    id: 'hw_completion',
    label: 'How often do you complete your mathematics homework?',
    type: 'scale',
    min: 1,
    max: 5,
    minLabel: 'Rarely',
    maxLabel: 'Always',
    allowSkip: true,
  },
  {
    id: 'study_hours_weekday',
    label:
      'On a typical weekday, how many hours do you spend studying or practicing mathematics outside of class?',
    type: 'select',
    options: ['0', 'Less than 30 min', '30–60 min', '1–2 hours', 'More than 2 hours', 'Prefer not to say'],
  },
  {
    id: 'study_hours_weekend',
    label:
      'On a typical weekend day, how many hours do you spend studying or practicing mathematics outside of class?',
    type: 'select',
    options: ['0', 'Less than 30 min', '30–60 min', '1–2 hours', 'More than 2 hours', 'Prefer not to say'],
  },
  {
    id: 'math_grade',
    label:
      'What percentage did you score in mathematics in your last school year report card?',
    type: 'select',
    options: ['< 70%', '70–80%', '80–90%', '> 90%', 'Prefer not to say'],
  },
]
