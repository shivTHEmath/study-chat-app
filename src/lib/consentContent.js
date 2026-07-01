// Consent form content for each supported language.
// mr translation is added in step 3.
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

  hi: {
    header: {
      eyebrow: 'चरण 1 / 3 · सूचित सहमति',
      title: 'अभिभावक की अनुमति और छात्र की सहमति',
      subtitle: 'कृपया पूरा फॉर्म पढ़ने के लिए स्क्रॉल करें।',
      loginLink: 'पहले से भाग ले रहे हैं? लॉग इन करें',
    },
    studyTitle:
      'मिडिल स्कूल के छात्रों में स्वतंत्र तर्क क्षमता पर AI ट्यूटर के डिज़ाइन मापदंडों का प्रभाव',
    pi: 'मुख्य शोधकर्ता: शिवसाई शर्दा — Non-Trivial Research Fellowship',
    contact: 'संपर्क: shivsai1811@gmail.com · (408) 872-2032',
    sections: [
      {
        title: 'सामान्य जानकारी और उद्देश्य',
        body: 'आपके बच्चे को एक शोध अध्ययन में भाग लेने के लिए आमंत्रित किया जा रहा है। कृपया इस फॉर्म को ध्यान से पढ़ें और भागीदारी के संभावित परिणामों को समझें। इस शोध का उद्देश्य यह जानना है कि AI ट्यूटरिंग सिस्टम की अलग-अलग सेटिंग्स छात्रों की स्वतंत्र रूप से सोचने और तर्क करने की क्षमता को कैसे प्रभावित कर सकती हैं। हम AI द्वारा दिए जाने वाले संकेतों की विशिष्टता, प्रतिक्रियाओं के बीच का समय, और इसी तरह के अन्य मापदंडों को बदलते हैं। कई प्रतिभागियों से डेटा एकत्र करके, हम AI ट्यूटरिंग सिस्टम को उस तरह से डिज़ाइन कर सकते हैं जो छात्रों के लिए सबसे अधिक फायदेमंद हो।',
      },
      {
        title: 'प्रक्रिया',
        body: 'अध्ययन की शुरुआत में, छात्र लगभग दस मिनट का एक सर्वेक्षण पूरा करेंगे जिसमें उनकी मौजूदा जानकारी और सहायता की उपलब्धता को मापा जाएगा। अगले तीन हफ्तों में, प्रतिभागी गणित के विषयों में सहायता, सीखने या दोहराने के लिए कुल कम से कम दस घंटे AI ट्यूटरिंग सिस्टम के साथ काम करेंगे। कुछ सत्रों के अंत में, छात्रों को स्वतंत्र तर्क पर प्रभाव मापने के लिए लगभग बीस मिनट के मूल्यांकन दिए जा सकते हैं। आपके बच्चे को यादृच्छिक प्रक्रिया के आधार पर ट्यूटरिंग टूल का एक संस्करण मिलेगा। अध्ययन में कुल लगभग 100 छात्र भाग लेंगे।',
      },
      {
        title: 'जोखिम',
        body: 'इस अध्ययन में बहुत कम जोखिम है। कुछ प्रतिभागियों को ऐसा ट्यूटरिंग सिस्टम मिल सकता है जो हमारी अपेक्षा में अन्य की तुलना में थोड़ा कम प्रभावी हो, हालाँकि इसके प्रभाव सामान्य कक्षा-आधारित शिक्षा के समान ही होंगे। ट्यूटरिंग सिस्टम इस तरह बनाया गया है कि वह सीधे जवाब नहीं देता, बल्कि स्वतंत्र सोच को बढ़ावा देने के लिए सवाल और संकेत देता है।',
      },
      {
        title: 'लाभ',
        body: 'आपके बच्चे को दी गई व्याख्याओं, संकेतों और अतिरिक्त गणित अभ्यास से फायदा हो सकता है। भागीदारी से सीधे लाभ की कोई गारंटी नहीं है।',
      },
      {
        title: 'मुआवज़ा, लागत और प्रतिपूर्ति',
        body: 'भाग लेने के लिए आपके बच्चे को कोई आर्थिक भुगतान नहीं मिलेगा। आपके या आपके बच्चे के लिए भागीदारी में कोई खर्च नहीं है।',
      },
      {
        title: 'वापसी या समाप्ति',
        body: 'आपका बच्चा बिना किसी नकारात्मक परिणाम के और बिना कोई कारण बताए किसी भी समय अध्ययन से हट सकता है। हटने के लिए, shivsai1811@gmail.com या (408) 872-2032 पर शिवसाई शर्दा से संपर्क करें। ट्यूटरिंग सिस्टम के दुरुपयोग, इस फॉर्म की शर्तों के उल्लंघन, या किसी भी कारण से अध्ययन जल्दी समाप्त होने पर आपके बच्चे को भी अध्ययन से हटाया जा सकता है। यदि ऐसा होता है तो आपको तुरंत सूचित किया जाएगा।',
      },
      {
        title: 'गोपनीयता',
        body: 'एकत्र किया गया डेटा केवल मुख्य शोधकर्ता के पास रहेगा। प्रतिभागियों के नाम एकत्र नहीं किए जाएंगे; उन्हें केवल उपयोगकर्ता नाम से पहचाना जाएगा। व्यक्तिगत पहचान योग्य या संवेदनशील जानकारी (जैसे आईडी नंबर या वित्तीय जानकारी) एकत्र नहीं की जाएगी। एकत्र किए गए डेटा में ट्यूटरिंग सिस्टम के साथ संदेश इतिहास, स्व-रिपोर्ट की गई पूर्व जानकारी, लिंग और कक्षा, और सर्वेक्षण व मूल्यांकन परिणाम शामिल हैं। सभी डेटा केवल मुख्य शोधकर्ता द्वारा पहुँच योग्य पासवर्ड-संरक्षित डेटाबेस (Supabase) पर संग्रहीत है। अधिकांश डेटा सितंबर 2026 तक सुरक्षित रूप से हटा दिया जाएगा; सर्वेक्षण और मूल्यांकन परिणाम भविष्य के शोध के लिए 2027 के अंत तक रखे जा सकते हैं। यह अध्ययन डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 (भारत) का पालन करता है। डेटा को इस शोध के बाहर बेचा या साझा नहीं किया जाएगा। केवल अज्ञात निष्कर्ष प्रकाशित किए जाएंगे, और अनुरोध पर डेटा तुरंत हटाया जा सकता है।',
      },
      {
        title: 'भागीदारी के विकल्प',
        body: 'भागीदारी पूरी तरह स्वैच्छिक है, और कोई अनिवार्य विकल्प नहीं हैं।',
      },
      {
        title: 'अन्य बातें',
        body: 'शोधकर्ता का इस शोध के परिणामों में कोई आर्थिक हित या दांव नहीं है। यह केवल सार्वजनिक हित के लिए किया जा रहा है।',
      },
      {
        title: 'संपर्क जानकारी',
        body: 'शिवसाई शर्दा, Non-Trivial Research Fellowship। ईमेल: shivsai1811@gmail.com। फोन: (408) 872-2032।',
      },
      {
        title: 'स्वैच्छिक भागीदारी',
        body: 'आपके बच्चे को भाग लेने देने या न देने का निर्णय पूरी तरह आपका है। भाग न लेने का चुनाव करने से आपके बच्चे पर कोई नकारात्मक प्रभाव नहीं पड़ेगा। आप किसी भी समय हट सकते हैं।',
      },
    ],
    parentForm: {
      title: 'अभिभावक की अनुमति',
      description:
        'नीचे हस्ताक्षर करके, आप पुष्टि करते हैं कि आपने यह फॉर्म पढ़ा है और अपने बच्चे की अध्ययन में भागीदारी के किसी भी परिणाम को समझते हैं। आप स्वेच्छा से अपने बच्चे को इस अध्ययन में भाग लेने की अनुमति देते हैं, और समझते हैं कि आपका बच्चा किसी भी समय हट सकता है।',
      parentName: { label: 'अभिभावक का पूरा नाम', placeholder: 'माता, पिता या अभिभावक का नाम' },
      relationship: { label: 'बच्चे से संबंध', placeholder: 'जैसे: माता, पिता, अभिभावक' },
      childName: { label: 'बच्चे का नाम *', placeholder: 'बच्चे का पूरा नाम' },
      parentSignature: { label: 'अभिभावक के हस्ताक्षर', placeholder: 'हस्ताक्षर के रूप में अपना पूरा नाम लिखें' },
      dateLabel: 'दिनांक:',
      footnote:
        '* नाम केवल सहमति के उद्देश्य से एकत्र किए जाते हैं। इन्हें शोध डेटासेट से अलग रखा जाता है और एक निर्धारित समय-सारिणी पर हटा दिया जाता है।',
    },
    studentForm: {
      title: 'छात्र की सहमति फॉर्म',
      description:
        'शोधकर्ता शिवसाई शर्दा एक सर्वेक्षण कर रहे हैं जिसमें यह देखा जाएगा कि AI ट्यूटरिंग सिस्टम के अलग-अलग डिज़ाइन दीर्घकालिक स्वतंत्र सोच को कैसे प्रभावित कर सकते हैं। यह अध्ययन तीन (3) सप्ताह की अवधि में होगा, और आपसे अपेक्षा की जाएगी कि आप उस दौरान लगभग दस (10) घंटे AI ट्यूटरिंग सिस्टम के साथ काम करें।',
      studyInvolves: 'अध्ययन में शामिल हैं:',
      bullets: [
        'गणित के नए विषयों को सीखने या गणित की समस्याओं को हल करने में सहायता के लिए AI ट्यूटरिंग सिस्टम के साथ बातचीत करना',
        'पूर्व गणित ज्ञान और सहायता की उपलब्धता की पहचान करने वाला एक संक्षिप्त सर्वेक्षण भरना',
        'स्वतंत्र सोच के कुछ पहलुओं को मापने के लिए समय-समय पर संक्षिप्त मूल्यांकन देना',
      ],
      voluntaryNote:
        'इस अध्ययन में भाग लेना पूरी तरह आपकी पसंद है, और आप बिना किसी परिणाम के किसी भी समय अध्ययन से बाहर हो सकते हैं। इस अध्ययन में भाग लेने से कोई महत्वपूर्ण जोखिम नहीं है।',
      privacyNote:
        'आपके उत्तर और गतिविधि पूरी तरह मुख्य शोधकर्ता के पास निजी रहेंगे, और आपका नाम अध्ययन में कभी प्रकाशित नहीं होगा।',
      question: 'क्या आप इस अध्ययन में भाग लेने के लिए सहमत हैं?',
      yesButton: 'हाँ, मैं भाग लेने के लिए सहमत हूँ।',
      noButton: 'नहीं, मैं भाग नहीं लेना चाहता / चाहती।',
      studentName: { label: 'छात्र का नाम', placeholder: 'छात्र का पूरा नाम' },
      signature: { label: 'हस्ताक्षर', placeholder: 'हस्ताक्षर के रूप में अपना पूरा नाम लिखें' },
      dateLabel: 'दिनांक:',
    },
    footer: {
      scrollPrompt: 'पूरा फॉर्म पढ़ने के लिए स्क्रॉल करें',
      submit: 'सहमति और स्वीकृति जमा करें',
      submitting: 'जमा हो रहा है…',
    },
    errors: {
      saveError: 'आपकी प्रतिक्रिया सहेजी नहीं जा सकी। कृपया पुनः प्रयास करें।',
      genericError: 'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
    },
  },
}
