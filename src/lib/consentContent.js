// Consent form content for each supported language.
// hi and mr translations are added in steps 2 and 3.
// The page falls back to 'en' if a translation is not yet available.

export const content = {
  en: {
    header: {
      eyebrow: 'Step 1 of 3 · Informed consent',
      title: 'Parent consent & student assent',
      subtitle: 'Please scroll to read the full form.',
      loginLink: 'Returning participant? Log in',
    },
    studyTitle:
      'The Effect of AI Tutor Design Parameters on Independent Reasoning Capacity in Middle School Students',
    pi: 'Principal Investigator: Shivsai Sharda — Non-Trivial Research Fellowship',
    contact: 'Contact: shivsai1811@gmail.com · (408) 872-2032',
    sections: [
      {
        title: 'General information and purpose',
        body: "Your child is being invited to partake in a research study. Please review this form carefully to understand the potential consequences from participation. The purpose of this research study is to determine how different settings of an AI tutoring system could affect students' abilities to reason independently. We adjust parameters such as the specificity of hints given by the AI, the length of time between responses, and other similar factors. By collecting data from several participants, we can design AI tutoring systems in a way that benefits students the most.",
      },
      {
        title: 'Procedure',
        body: 'At the beginning of the study, students will complete a survey measuring existing knowledge and access to help, taking about ten minutes. Over the following three weeks, participants will interact with an AI tutoring system for at least ten hours total, for assistance with, learning, or revising mathematics topics. At the end of some sessions, students may be given assessments of about twenty minutes to measure the effects on independent reasoning. Your child will receive one version of the tutoring tool based on a randomized process. About 100 students total will take part in the study.',
      },
      {
        title: 'Risks',
        body: 'This study involves minimal risk. Some participants may receive a tutoring system we expect to be slightly less effective than others, though the effects will be comparable to standard classroom-based instruction. The tutoring system is designed to avoid handing out direct answers, instead using questioning and hints to support independent thinking.',
      },
      {
        title: 'Benefits',
        body: 'Your child may benefit from the explanations, hints, and additional mathematics practice provided. There is no guarantee of direct benefit from participating.',
      },
      {
        title: 'Compensation, costs, and reimbursements',
        body: 'Your child will not receive monetary payment for taking part. There are no costs to you or your child for participation.',
      },
      {
        title: 'Withdrawal or termination',
        body: "Your child may withdraw at any time without negative consequences and without needing to give a reason. To withdraw, contact Shivsai Sharda at shivsai1811@gmail.com or (408) 872-2032. Your child may also be removed from the study for malicious use of the tutoring system, violation of this form's terms, or if the study ends early for any reason. You will be notified promptly if this occurs.",
      },
      {
        title: 'Confidentiality',
        body: 'Data collected will remain private to the principal investigator. Participant names will not be collected; participants are identified by username only. Personally identifying or sensitive information (such as ID numbers or financial information) will not be collected. Data collected includes message history with the tutoring system, self-reported prior knowledge, gender and grade, and survey and assessment results. All data is stored on a password-protected database (Supabase) accessible only to the principal investigator. Most data will be securely deleted by September 2026; survey and assessment results may be kept until the end of 2027 for future research. This study complies with the Digital Personal Data Protection Act, 2023 (India). Data will not be sold or shared outside this research. Only anonymized findings will be published, and data can be deleted immediately upon request.',
      },
      {
        title: 'Alternatives to participation',
        body: 'Participation is entirely voluntary, and there are no required alternatives.',
      },
      {
        title: 'Other considerations',
        body: 'The researcher has no financial interest or stake in the outcomes of this research. It is conducted solely for public benefit.',
      },
      {
        title: 'Contact information',
        body: 'Shivsai Sharda, Non-Trivial Research Fellowship. Email: shivsai1811@gmail.com. Phone: (408) 872-2032.',
      },
      {
        title: 'Voluntary participation',
        body: 'The decision to allow your child to participate, or not to participate, is entirely yours. Choosing not to participate will have no negative effect on your child. You may withdraw at any time.',
      },
    ],
    parentForm: {
      title: 'Parental / guardian permission',
      description:
        'By signing below, you confirm that you have read this form and understand any consequences of having your child participate in the study. You voluntarily give permission for your child to participate in this study, and understand that your child can withdraw at any time.',
      parentName: { label: 'Parent / guardian full name', placeholder: 'Parent or guardian name' },
      relationship: { label: 'Relationship to child', placeholder: 'e.g. Mother, Father, Guardian' },
      childName: { label: 'Child name *', placeholder: "Child's full name" },
      parentSignature: { label: 'Parent / guardian signature', placeholder: 'Type your full name to sign' },
      dateLabel: 'Date:',
      footnote:
        '* Names are collected on the consent form solely for consent purposes. They are kept separate from research datasets, and deleted on a set schedule.',
    },
    studentForm: {
      title: 'Student assent form',
      description:
        'The researcher Shivsai Sharda is conducting a survey to see how different designs for an AI tutoring system can affect long-term independent thinking. The study will occur over a three (3) week duration, and you will be expected to interact with an AI tutoring system for about ten (10) hours over that period.',
      studyInvolves: 'The study involves:',
      bullets: [
        'Interacting and engaging with an AI tutoring system for assistance in learning new mathematical topics or help with solving mathematics problems',
        'Taking a short survey identifying prior math knowledge and access to help',
        'Periodically taking short assessments to measure some facets of independent thinking',
      ],
      voluntaryNote:
        'Participating in this study is your choice entirely, and you may choose to opt-out of the study at any time, without consequences. There are no significant risks to participating in this study.',
      privacyNote:
        'Your answers and activity will remain entirely private to the principal investigator, and your name will never be published in the study.',
      question: 'Do you agree to take part in this study?',
      yesButton: 'Yes, I agree to participate.',
      noButton: 'No, I do not want to participate.',
      studentName: { label: 'Student name', placeholder: 'Student full name' },
      signature: { label: 'Signature', placeholder: 'Type your full name to sign' },
      dateLabel: 'Date:',
    },
    footer: {
      scrollPrompt: 'Scroll to read the full form',
      submit: 'Submit consent and assent',
      submitting: 'Submitting…',
    },
    errors: {
      saveError: 'Could not save your response. Please try again.',
      genericError: 'Something went wrong. Please try again.',
    },
  },
}
