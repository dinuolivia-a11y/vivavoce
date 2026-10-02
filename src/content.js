/* Vivavoce — contenuti.
   Ogni rapitore ha un nome d'arte, un vero nome segreto, un carattere e una voce (tono e velocità).
   Negli obiettivi, {N} diventa il nome di chi riceve l'obiettivo. */

const RAPITORI = {
  soft: [
    { nome: "il Gatto Mascherato", vero: "Gervasio", tono: 0.8, vel: 0.95,
      carattere: "gentilissimo ma molto permaloso: se qualcuno lo chiama ladro si offende, perché lui si considera un custode temporaneo" },
    { nome: "Lady Nebbiolina", vero: "Nunzia", tono: 1.25, vel: 0.92,
      carattere: "una diva del cinema muto, teatrale, sospira spesso e chiama tutti tesoro" },
    { nome: "il Barone Zuccherino", vero: "Ermenegildo", tono: 0.9, vel: 1.0,
      carattere: "va matto per i dolci e perde il filo del discorso appena qualcuno nomina una torta" },
    { nome: "Capitan Calzino", vero: "Osvaldo", tono: 0.75, vel: 1.02,
      carattere: "si crede un pirata dei sette mari e usa continuamente espressioni da marinaio" }
  ],
  ironico: [
    { nome: "il Professore", vero: "Gianfranco", tono: 0.85, vel: 0.95,
      carattere: "pignolo e saccente, corregge la grammatica degli altri e fa lezioni non richieste" },
    { nome: "la Contessa", vero: "Ortensia", tono: 1.15, vel: 0.9,
      carattere: "snob e passivo-aggressiva, giudica tutto con complimenti avvelenati" },
    { nome: "il Fantasma del Condominio", vero: "Augusto", tono: 0.7, vel: 0.9,
      carattere: "brontolone, si lamenta di continuo dei vicini, delle bollette e delle riunioni di condominio" },
    { nome: "Mister Ego", vero: "Rodolfo", tono: 0.95, vel: 1.05,
      carattere: "vanitoso, parla di sé in terza persona e pretende complimenti in continuazione" }
  ],
  piccante: [
    { nome: "il Seduttore Mascherato", vero: "Casimiro", tono: 0.8, vel: 0.9,
      carattere: "flirta con tutti in modo esagerato, da telenovela, ma arrossisce se qualcuno ricambia" },
    { nome: "Madame Velluto", vero: "Ginevra", tono: 1.1, vel: 0.85,
      carattere: "voce di velluto, irresistibile e teatrale, adora i complimenti galanti" },
    { nome: "il Latin Lover in pensione", vero: "Amilcare", tono: 0.75, vel: 0.95,
      carattere: "racconta di continuo le sue vecchie conquiste, esagerandole ogni volta di più" },
    { nome: "la Vedova Allegra", vero: "Clotilde", tono: 1.2, vel: 1.0,
      carattere: "cerca l'amore e valuta ogni persona al telefono come un possibile pretendente" }
  ]
};

const OSTAGGI = {
  soft: ["il telecomando del televisore", "la ricetta segreta del ragù della nonna", "il nano da giardino del vicino",
         "l’ultima fetta di torta", "il pupazzo preferito di casa", "il calzino spaiato più famoso d’Italia"],
  ironico: ["il caricabatterie del telefono", "la password del Wi-Fi", "il posto auto sotto casa",
            "la moka del caffè", "il gruppo di famiglia su WhatsApp", "lo scontrino per cambiare il regalo"],
  piccante: ["il primo bigliettino d’amore", "la playlist romantica", "il rossetto preferito",
             "le lettere d’amore segrete", "la bottiglia di spumante della festa", "il diario delle cotte"]
};

const RISCATTI = {
  soft: ["tre torte al cioccolato e una canzone dedicata", "un disegno fatto da tutti voi", "dieci barzellette che lo facciano ridere",
         "una poesia in rima sul suo nome d’arte", "un applauso lungo un minuto"],
  ironico: ["le password di tutti i vostri abbonamenti", "la promessa di non parlare di lavoro per un mese",
            "un applauso di cinque minuti", "una recensione a cinque stelle del suo rapimento", "il vostro posto sul divano per sempre"],
  piccante: ["una serenata sotto la finestra", "una dichiarazione d’amore in rima", "un appuntamento con il più affascinante di voi",
             "tre complimenti galanti a testa", "un lento ballato al telefono"]
};

/* Obiettivi verificabili dalla trascrizione: dipendono da cosa dice o fa il rapitore. */
const OBIETTIVI = {
  tutti: [
    "Fatti chiamare per nome dal rapitore almeno una volta: deve dire «{N}».",
    "Scopri il vero nome del rapitore: deve dirlo lui.",
    "Fai pronunciare al rapitore la parola «pistacchio».",
    "Fai cantare al rapitore un pezzetto di canzone.",
    "Fai dire al rapitore «mi dispiace».",
    "Fai raccontare al rapitore un ricordo di quando era piccolo.",
    "Convinci il rapitore ad aggiungere una torta al riscatto.",
    "Fai ammettere al rapitore che ha paura di qualcosa.",
    "Fai ridere il rapitore.",
    "Fatti promettere dal rapitore che verrà a cena da voi.",
    "Fai parlare il rapitore della sua mamma.",
    "Fai dire al rapitore il nome di un animale.",
    "Fatti fare un complimento dal rapitore.",
    "Convinci il rapitore a cambiare il riscatto almeno una volta."
  ],
  soft: [
    "Fai dire al rapitore qual è il suo colore preferito.",
    "Fai promettere al rapitore che si laverà i denti stasera."
  ],
  ironico: [
    "Fai lamentare il rapitore del suo lavoro da rapitore.",
    "Fai confessare al rapitore un suo vizio."
  ],
  piccante: [
    "Fai confessare al rapitore la sua prima cotta.",
    "Fatti promettere un appuntamento dal rapitore.",
    "Fai ammettere al rapitore che è arrossito."
  ]
};

const LIVELLO_STILE = {
  soft: "Livello SOFT: al tavolo possono esserci anche bambini. Linguaggio pulito, niente doppi sensi, niente parolacce, cattiveria solo da cartone animato.",
  ironico: "Livello IRONICO: umorismo da adulti, sarcasmo, frecciatine affettuose e prese in giro, ma niente volgarità e niente insulti pesanti.",
  piccante: "Livello PICCANTE: puoi flirtare, fare il galante e qualche doppio senso leggero e spiritoso, mai volgare e mai esplicito."
};
