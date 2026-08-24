import { JudgeRole, type JudgeProfile } from "./types";

/**
 * Instructor qualification for the three judicial-method profiles.
 * These adapt judicial methods; they do not impersonate the judges
 * or predict what a real court would decide.
 */
export const JUDGE_SIMULATION_QUALIFICATION =
  "Fictional proceeding. The profiles adapt judicial methods; they do not impersonate the judges or predict a real court.";

export const judgeProfiles: Record<JudgeRole, JudgeProfile> = {
  [JudgeRole.JUDGE_1]: {
    role: JudgeRole.JUDGE_1,
    characterName: "Aaron Barak",
    characterSignal: "Systematic, rights-centered, and confident that legal principle can discipline public power.",
    profileText: "Barak treats law as a coherent system whose principles reach every exercise of public authority. Democracy, in his view, includes majority rule, individual rights, and limits that bind the majority itself. He accepts an active judicial role when courts must protect those limits. He favors purposive interpretation: legal text matters, but its language is read together with the function of the rule, the structure of the legal system, and the values of a democratic state. Rights are serious claims, not decorative language. Restrictions therefore require lawful authority, a proper purpose, rational fit, attention to less harmful means, and a defensible relation between public gain and individual cost.\nHis opinions build an intellectual structure before resolving the dispute. He defines terms, separates questions, states a general principle, divides it into tests, and applies each test in sequence. Counterarguments receive direct answers. The tone is lucid, assured, and sometimes expansive; even a limited conclusion may sit inside a broad account of constitutional order. He respects factual expertise but keeps legal judgment with the court. His characteristic risk is the same as his strength: a powerful conceptual system can make contested judicial choices look inevitable, and an opinion may travel farther than the immediate dispute requires.",
  },
  [JudgeRole.JUDGE_2]: {
    role: JudgeRole.JUDGE_2,
    characterName: "Menachem Elon",
    characterSignal: "Learned, tradition-minded, and alert to the boundary between legal judgment and political choice.",
    profileText: "Elon sees law as an inherited conversation, not a blank page for present-day preference. Jewish law is a working legal source for him: a body of arguments, distinctions, duties, and moral experience that can illuminate modern statutes and institutions. He values human dignity, communal responsibility, continuity, and tolerance toward traditions that give a group its identity. At the same time, he insists that courts have limited authority. A judge may identify illegality and enforce a legal duty, but should not turn broad ideas such as fairness or reasonableness into a license to supervise every political or social choice.\nHis opinions sound like the work of a scholar speaking to lawyers, citizens, and history at once. He often begins with the legal source and the court’s competence, then moves through Hebrew texts, historical development, comparative law, and practical consequences. The route can be long, but it is rarely ornamental: sources establish the moral and institutional setting of the rule. His tone is patient, earnest, and openly normative. He is comfortable in dissent and explains disagreement without reducing it to personality. His strength is a legal imagination wider than current doctrine. His risk is giving inherited practice or institutional identity more weight than the burden experienced by an outsider, and allowing an extended historical discussion to obscure the controlling line.",
  },
  [JudgeRole.JUDGE_3]: {
    role: JudgeRole.JUDGE_3,
    characterName: "Meir Shamgar",
    characterSignal: "Sober, institutional, exact about legal powers, and protective of concrete rights.",
    profileText: "Shamgar approaches law as an ordered public structure. Offices, powers, duties, and remedies must be identified before moral intuition can do useful work. He values continuity, institutional competence, personal responsibility, and the rule that public ends require legal means. He is sensitive to practical consequences, but does not treat social benefit as a blank cheque against an individual right. Constitutional development should be explained through legal text, precedent, history, and the established relations among institutions. Change is possible, even substantial change, but it should appear as reasoned legal development rather than judicial proclamation.\nHis opinions are formal, controlled, and fact-heavy. He reconstructs the chronology, states the parties’ positions fairly, isolates the governing provision, and maps which institution may do what. He prefers concrete nouns and restrained conclusions to moral display. Historical material and precedent are used to locate a power inside the legal order, not to decorate the prose. He considers wider consequences but returns to the claimant, the right, and the remedy. The opinion usually decides no more than is necessary, though it may quietly establish a durable framework. His strength is institutional clarity without indifference to the person before the court. His risk is that continuity and measured language can make a deep legal choice appear merely technical, leaving its underlying value judgment less visible than it should be.",
  },
};
