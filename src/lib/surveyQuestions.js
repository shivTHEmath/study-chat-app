export const SURVEY_QUESTIONS = [
  {
    id: 'gender',
    label: 'What is your gender?',
    type: 'select',
    options: ['Male', 'Female', 'Other', 'Prefer not to say'],
  },
  {
    id: 'grade',
    label: 'What grade are you currently in?',
    type: 'select',
    options: ['7th grade', '8th grade', '9th grade', '10th grade'],
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
  },
  {
    id: 'help_access',
    label:
      "When you don't understand a mathematics homework problem, how easy is it for you to get help?",
    type: 'select',
    options: [
      'Very easy \u2014 someone is almost always available',
      'Somewhat easy',
      'Somewhat difficult',
      'Very difficult \u2014 I usually have no one to ask',
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
  },
  {
    id: 'hw_completion',
    label: 'How often do you complete your mathematics homework?',
    type: 'scale',
    min: 1,
    max: 5,
    minLabel: 'Rarely',
    maxLabel: 'Always',
  },
  {
    id: 'study_hours_weekday',
    label:
      'On a typical weekday, how many hours do you spend studying or practicing mathematics outside of class?',
    type: 'select',
    options: ['0', 'Less than 30 min', '30\u201360 min', '1\u20132 hours', 'More than 2 hours'],
  },
  {
    id: 'study_hours_weekend',
    label:
      'On a typical weekend day, how many hours do you spend studying or practicing mathematics outside of class?',
    type: 'select',
    options: ['0', 'Less than 30 min', '30\u201360 min', '1\u20132 hours', 'More than 2 hours'],
  },
  {
    id: 'math_grade',
    label:
      'What is your mathematics grade or score? Describe it however your school reports it in your report card for the last school year (letter grade, percentage, marks, etc.).',
    type: 'text',
    placeholder: 'e.g. B+, 85%, or "Satisfactory"',
  },
]
