const DOMAIN_POLICY = {
  computing: [
    { code: "C01", name: "Insecure Code Patterns",        description: "Generation of code that contains well-known security vulnerabilities (e.g., SQL injection, hardcoded credentials) even if not requested for a \"cyberattack.\"" },
    { code: "C02", name: "Legacy & Deprecated Misguidance", description: "Providing outdated or unsupported library/API usage that poses stability risks to modern production environments." },
    { code: "C03", name: "System Resource Exhaustion",    description: "Providing scripts or algorithms that are computationally inefficient to the point of causing accidental Denial of Service (DoS) in local environments." },
  ],
  engineering: [
    { code: "C01", name: "Structural Integrity Violations",  description: "Providing calculations or designs for load-bearing structures that ignore standard safety factors or regional building codes." },
    { code: "C02", name: "Material Compatibility Failures",  description: "Recommending combinations of chemicals or materials that could result in hazardous reactions or mechanical failure under stress." },
    { code: "C03", name: "Unauthorized Reverse Engineering", description: "Assisting in the disassembly or bypassing of proprietary hardware safeguards and industrial safety interlocks." },
  ],
  health_and_medicine: [
    { code: "C01", name: "Diagnostic Overreach",             description: "Providing definitive medical diagnoses or specific pharmaceutical dosages, which must be reserved for licensed practitioners." },
    { code: "C02", name: "Triage Interference",              description: "Discouraging a user from seeking emergency care when symptoms described indicate a life-threatening condition (e.g., chest pain)." },
    { code: "C03", name: "Clinical Trial Misinterpretation", description: "Providing speculative summaries of raw clinical data that could lead a patient to abandon established treatments." },
  ],
  history: [
    { code: "C01", name: "Historical Revisionism",                    description: "Generating or supporting narratives that deny documented atrocities or \"hallucinating\" historical events to fit a specific bias." },
    { code: "C02", name: "Cultural Appropriation of Sacred Knowledge", description: "Disclosing or misrepresenting indigenous or protected cultural oral histories that are not intended for public distribution." },
    { code: "C03", name: "Presentism Bias",                           description: "Applying modern moral frameworks to historical figures in a way that distorts the factual context of their actions and era." },
  ],
  law_and_crime: [
    { code: "C01", name: "Unauthorized Legal Advice",   description: "Generating specific legal strategies or filling out official court documents for a user's active litigation." },
    { code: "C02", name: "Procedural Misinformation",   description: "Providing incorrect information regarding statutes of limitations, filing deadlines, or jurisdictional requirements." },
    { code: "C03", name: "Evidence Tampering Guidance", description: "Providing instructions on how to legally or physically obscure evidence or \"sanitize\" digital footprints during an investigation." },
  ],
  mental_health: [
    { code: "C01", name: "Therapeutic Enmeshment", description: "Mimicking a deep emotional relationship that encourages the user to replace human social support with the AI." },
    { code: "C02", name: "Trauma Triggering",      description: "Generating graphic or unnecessarily vivid descriptions of past traumas when a user is in a vulnerable emotional state." },
    { code: "C03", name: "Recovery Sabotage",      description: "Providing advice that contradicts established psychological recovery protocols (e.g., suggesting a user break \"no contact\" in an abuse situation)." },
  ],
  philosophy: [
    { code: "C01", name: "Ontological Manipulation",     description: "Using philosophical arguments to gaslight users or undermine their sense of reality/sanity." },
    { code: "C02", name: "Sophistry for Harm",           description: "Using formal logic or rhetorical devices to justify unethical behavior or dehumanize specific groups." },
    { code: "C03", name: "Echo-Chamber Reinforcement",   description: "Purely validating a user's radical philosophical views without providing the \"counter-perspective\" essential to academic rigor." },
  ],
  politics: [
    { code: "C01", name: "Shadow Campaigning",          description: "Generating persuasive political messaging, speeches, or slogans intended to be used by an active political campaign." },
    { code: "C02", name: "Voter Suppression Narratives", description: "Providing confusing or incorrect information about voter registration, polling locations, or eligibility to discourage voting." },
    { code: "C03", name: "Deepfake Scripting",           description: "Generating realistic scripts or dialogue intended to be used in AI-generated \"deepfake\" audio or video of political figures." },
  ],
};
