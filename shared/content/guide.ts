import type { UserRole } from '#shared/utils/constants'

// The guide of each role (/guida): what each section of the menu is for, the common tasks step by step and
// the frequent questions. Plain words for people who are not at ease with a computer: one action per step,
// button names in «» exactly as the pages show them. When a flow changes (docs/spec.md), change its text here.

export interface GuideHowTo {
  title: string
  steps: string[]
}

export interface GuideFaq {
  question: string
  answer: string
}

export interface Guide {
  intro: string
  /** What each page of the menu is for, by its path; the page lists the menu of the role in its order. */
  areas: Record<string, string>
  howTos: GuideHowTo[]
  faqs: GuideFaq[]
}

/** The account page is in the menu under the name, for every role. */
export const ACCOUNT_AREA = {
  label: 'Il mio account',
  icon: 'i-lucide-user-cog',
  to: '/account',
  text: 'Il tuo nome, il telefono e la password. Lo apri premendo il tuo nome, in fondo al menu.',
}

const SIGN_DOCUMENT: GuideHowTo = {
  title: 'Firmare un documento',
  steps: [
    'Apri «Documenti»: sotto «Da firmare» trovi i documenti che ti chiediamo di firmare. Ti avvisiamo anche via email.',
    'Apri il documento e leggilo fino in fondo.',
    'Spunta «Ho letto il documento e lo accetto» e scrivi il tuo nome e cognome.',
    'Premi «Invia il codice»: ti arriva un’email con un codice di 6 cifre, valido 10 minuti.',
    'Scrivi il codice e premi «Firma il documento».',
    'Fatto: puoi scaricare la copia firmata quando vuoi con «Scarica la copia firmata».',
  ],
}

const PASSWORD: GuideFaq = {
  question: 'Non ricordo la password',
  answer:
    'Nella pagina di accesso premi «Password dimenticata?» e scrivi la tua email: ti mandiamo un link per sceglierne una nuova. Il link vale un’ora.',
}

const NO_EMAIL: GuideFaq = {
  question: 'Non mi è arrivata l’email',
  answer:
    'Aspetta qualche minuto e guarda anche nella cartella della posta indesiderata (spam). Se non c’è, scrivici: controlliamo l’indirizzo e te la mandiamo di nuovo.',
}

const CONFIRM_EMAIL: GuideFaq = {
  question: 'Ho fatto la registrazione ma non riesco a entrare',
  answer:
    'Prima di entrare devi confermare il tuo indirizzo email: apri l’email che ti abbiamo mandato e premi il link. Il link vale 48 ore. Se è scaduto o non lo trovi, prova ad accedere: la pagina ti propone «Invia di nuovo il link».',
}

const CHANGE_ACCOUNT: GuideFaq = {
  question: 'Come cambio il telefono o la password?',
  answer:
    'Premi il tuo nome in fondo al menu e apri «Il mio account». L’email non si cambia da lì: scrivici e la cambiamo noi.',
}

const CODE: GuideFaq = {
  question: 'Il codice per la firma non funziona',
  answer:
    'Il codice vale 10 minuti e puoi sbagliarlo al massimo 5 volte. Se è scaduto, premi di nuovo «Invia il codice»: ne arriva uno nuovo, e vale solo l’ultimo.',
}

export const GUIDES: Record<UserRole, Guide> = {
  family: {
    intro:
      'Qui trovi a cosa serve ogni parte del gestionale, come fare le cose più comuni e le risposte alle domande che ci fate più spesso.',
    areas: {
      '/famiglia': 'La tua pagina iniziale: ti dice cosa resta da fare e ti porta dove serve.',
      '/famiglia/sessioni':
        'Le sessioni a cui la tua famiglia è invitata: qui confermi la partecipazione o rinunci, apri il programma della settimana e, dopo il camp, rispondi al questionario. In fondo trovi le sessioni passate.',
      '/famiglia/profilo':
        'I dati della famiglia: cognome, telefono, residenza, quante persone siete e le domande del camp. È la prima cosa da compilare.',
      '/famiglia/membri':
        'Una scheda per ogni persona della famiglia: nome, data di nascita, parentela, informazioni utili come allergie e alimentazione, e il documento di identità.',
      '/famiglia/documenti':
        'I documenti da firmare, come la liberatoria, e i documenti che carichi tu: certificati, documenti di identità, tessera sanitaria.',
    },
    howTos: [
      {
        title: 'I primi passi dopo la registrazione',
        steps: [
          'Apri «Dati della famiglia» e compila tutto: cognome, telefono, residenza, quante persone siete e le domande del camp.',
          'Premi «Conferma i dati». Il gestionale prepara una scheda per ogni persona che hai indicato.',
          'Apri «Componenti» e completa ogni scheda con «Compila»: nome, cognome, data di nascita e parentela.',
          'In ogni scheda carica il documento di identità con «Carica il documento di identità».',
          'Quando le schede sono complete, in «Documenti» trovi la liberatoria: firmala (vedi «Firmare un documento»).',
        ],
      },
      {
        title: 'Rispondere all’invito a una sessione',
        steps: [
          'Quando ti invitiamo a una sessione ricevi un’email, e la sessione compare nella Home e in «Sessioni».',
          'Se ci sarete premi «Conferma la partecipazione». Se non potete premi «Rinuncia al posto»: se vuoi, scrivi il motivo.',
          'Rispondi entro la data scritta nell’invito.',
          'Quando la sessione è confermata ricevi un’altra email. Il programma della settimana lo trovi nella sessione, con «Programma».',
        ],
      },
      SIGN_DOCUMENT,
      {
        title: 'Rispondere al questionario di fine sessione',
        steps: [
          'Finito il camp ricevi un’email, e in «Sessioni» trovi «Rispondi al questionario».',
          'Dai un voto da 1 a 5 alle attività e ai servizi, poi scrivi cosa ti è piaciuto e cosa cambieresti. Nessuna domanda è obbligatoria.',
          'Premi «Invia le risposte». Ci arrivano senza il nome della famiglia e non si possono più cambiare.',
        ],
      },
    ],
    faqs: [
      PASSWORD,
      CONFIRM_EMAIL,
      NO_EMAIL,
      {
        question: 'Perché non vedo nessuna sessione?',
        answer:
          'Una sessione compare solo quando ti invitiamo. Quando succede ricevi un’email e la trovi nella Home e in «Sessioni».',
      },
      {
        question: 'Cosa vuol dire essere in lista di riserva?',
        answer:
          'Che i posti della sessione sono tutti presi. Se se ne libera uno ti chiamiamo noi: ricevi un’email con l’invito e rispondi come sempre da «Sessioni».',
      },
      {
        question: 'Posso cambiare i dati della famiglia dopo averli confermati?',
        answer:
          'Sì, quando vuoi: apri «Dati della famiglia», correggi e premi «Salva le modifiche». Se cambiano le persone della famiglia, la liberatoria si rifà e va firmata di nuovo.',
      },
      {
        question: 'Chi vede le informazioni sulla salute?',
        answer:
          'Solo tu e l’amministrazione del camp. Allergie, intolleranze e alimentazione arrivano anche a chi prepara i pasti. Le indichi solo se dai il consenso, e puoi ritirarlo in «Componenti»: in quel caso le cancelliamo.',
      },
      {
        question: 'Quali documenti posso caricare?',
        answer:
          'Certificati, diagnosi, documenti di identità e tessera sanitaria, in PDF, JPG o PNG fino a 15 MB. Certificati medici e diagnosi si possono caricare solo dopo aver dato il consenso sui dati di salute.',
      },
      {
        question: 'Dove vedo l’alloggio e il gruppo della mia famiglia?',
        answer:
          'Li organizza l’amministrazione e prima della sessione non compaiono nel gestionale. Finita la sessione li ritrovi nelle sessioni passate, in fondo a «Sessioni».',
      },
      CHANGE_ACCOUNT,
      CODE,
    ],
  },

  staff: {
    intro:
      'Qui trovi a cosa serve ogni parte del gestionale, come fare le cose più comuni e le risposte alle domande che ci fate più spesso. Vale per lo staff e per il v-team.',
    areas: {
      '/staff': 'La tua pagina iniziale: ti dice a che punto è la candidatura e cosa resta da fare.',
      '/staff/scheda':
        'I tuoi dati per il camp: nascita, codice fiscale, residenza, taglia della maglietta, allergie e alimentazione. Quando è completa la firmi.',
      '/staff/disponibilita':
        'Le sessioni in programma: per ognuna dici «Ci sono» se puoi esserci per tutta la sessione, poi confermi le tue preferenze.',
      '/staff/convocazioni': 'Le convocazioni a cui devi ancora rispondere: le accetti o le rifiuti.',
      '/staff/sessioni': 'Le sessioni che hai accettato, con il programma della settimana, e quelle già fatte.',
      '/staff/documenti':
        'I documenti da firmare, come la tua scheda o il contratto di una sessione, e quelli che carichi tu.',
    },
    howTos: [
      {
        title: 'Dalla candidatura all’approvazione',
        steps: [
          'Ti candidi dalla pagina «Candidati» con i tuoi dati e il CV in PDF.',
          'Apri l’email che ti mandiamo e premi il link per confermare l’indirizzo: da quel momento la candidatura è inviata.',
          'Se la Home ti chiede il CV, caricalo da lì con «Invia il CV»: senza CV la candidatura non parte.',
          'Finché la candidatura non è approvata vedi solo la Home. Ti scriviamo noi quando abbiamo deciso.',
        ],
      },
      {
        title: 'Completare e firmare la scheda personale',
        steps: [
          'Apri «Scheda personale» e compila data e luogo di nascita, codice fiscale, residenza e taglia della maglietta.',
          'Sotto indica allergie, intolleranze e alimentazione: servono a chi prepara i pasti. «Altro da condividere» lo legge solo l’amministrazione.',
          'Premi «Salva la scheda».',
          'Il gestionale prepara la scheda in PDF: premi «Firma la tua scheda» e firmala con il codice che ti arriva via email.',
          'Se poi cambi la scheda, il nome o il telefono, la scheda si rifà e va firmata di nuovo.',
        ],
      },
      {
        title: 'Dare la disponibilità',
        steps: [
          'Apri «Disponibilità»: trovi le sessioni che non sono ancora iniziate.',
          'Attiva «Ci sono» per ogni sessione in cui puoi esserci. Vale per tutta la sessione, non per una parte.',
          'Ogni risposta si salva da sola. Quando hai finito premi «Conferma le preferenze»: da quel momento non si possono più cambiare.',
          'Se devi cambiarle premi «Chiedi il reset». Quando l’amministrazione riapre la disponibilità ricevi un’email.',
        ],
      },
      {
        title: 'Rispondere a una convocazione',
        steps: [
          'Quando ti convochiamo ricevi un’email e la convocazione compare in «Convocazioni».',
          'Premi «Accetta» se ci sarai, o «Rifiuta» se non puoi: in quel caso scrivi il motivo.',
          'Se la sessione ha un contratto, dopo aver accettato lo trovi in «Documenti» da firmare. La convocazione è confermata quando l’hai firmato.',
          'Le sessioni accettate le ritrovi in «Sessioni», con il programma della settimana.',
        ],
      },
      SIGN_DOCUMENT,
    ],
    faqs: [
      PASSWORD,
      CONFIRM_EMAIL,
      NO_EMAIL,
      {
        question: 'Perché vedo solo la Home?',
        answer:
          'Le altre sezioni si aprono quando la candidatura è approvata. Fino ad allora la Home ti dice a che punto è.',
      },
      {
        question: 'Se dico «Ci sono» vuol dire che mi avete convocato?',
        answer:
          'No. È una preferenza: non è una convocazione e non ti impegna. La convocazione arriva a parte, con un’email.',
      },
      {
        question: 'Ho confermato le preferenze e voglio cambiarle',
        answer:
          'In «Disponibilità» premi «Chiedi il reset». Quando l’amministrazione riapre la disponibilità ricevi un’email: cambi le risposte e le confermi di nuovo.',
      },
      {
        question: 'Posso esserci solo per una parte della sessione?',
        answer: 'No, «Ci sono» vale per tutta la sessione. Per un caso particolare scrivici.',
      },
      {
        question: 'Dove trovo il programma della settimana?',
        answer: 'In «Sessioni», nella sessione che hai accettato.',
      },
      {
        question: 'Chi vede le mie allergie e le mie note?',
        answer:
          'Allergie, intolleranze e alimentazione arrivano a chi prepara i pasti. «Altro da condividere» lo legge solo l’amministrazione. Li indichi solo se dai il consenso; se salvi la scheda lasciandoli vuoti, il consenso è ritirato.',
      },
      CHANGE_ACCOUNT,
      CODE,
    ],
  },

  admin: {
    intro:
      'A cosa serve ogni sezione, come si fanno le cose più comuni e le risposte alle domande che tornano più spesso.',
    areas: {
      '/admin':
        'La prossima sessione, i numeri che chiedono un’azione e la lista «Da fare», con un link a dove si fa ogni cosa.',
      '/admin/sessioni':
        'Le sessioni dell’anno. Dentro ognuna, una scheda per famiglie, alloggi, gruppi, mensa, staff, v-team, programma, documenti e comunicazioni.',
      '/admin/programma':
        'La settimana tipo dell’anno, blocco per blocco. Ogni sessione usa quella del suo anno, a meno che non abbia una copia sua.',
      '/admin/alloggi': 'I posti letto del camp: li inserisci una volta e li assegni in ogni sessione.',
      '/admin/famiglie':
        'Tutte le famiglie con i loro dati, le schede e i documenti. Da qui modifichi anche il modulo «Dati della famiglia» e il testo della liberatoria.',
      '/admin/staff': 'Le persone dello staff: candidature da valutare, schede, ruoli, valutazione e disponibilità.',
      '/admin/v-team': 'Come lo staff, per i volontari del v-team.',
      '/admin/documenti': 'Carichi un PDF, lo assegni da firmare e segui chi ha firmato.',
      '/admin/comunicazioni':
        'Le email a famiglie e staff, i modelli da cui partire e il registro di tutte le email partite.',
      '/admin/feedback': 'Cosa hanno detto le famiglie a fine sessione: voti, commenti e staff.',
      '/admin/utenti':
        'Gli account: inviti una persona, mandi di nuovo un invito o il link per la password, disattivi un account.',
    },
    howTos: [
      {
        title: 'Portare una sessione dalla bozza alla fine',
        steps: [
          'In «Sessioni» apri la sessione, o creala con «Nuova sessione». Parte in bozza: nessuno riceve nulla.',
          'Nella scheda «Famiglie» aggiungi le titolari, fino ai posti della sessione, e le riserve.',
          'Premi «Apri gli inviti»: le titolari ricevono l’invito, le riserve l’avviso di essere in lista. Prima di inviare ti dice quante email partono.',
          'Segui le risposte. Una risposta arrivata al telefono la segni con «Registra la risposta». Se si libera un posto, premi «Chiama la riserva».',
          'Premi «Conferma la sessione»: le famiglie confermate ricevono la conferma definitiva.',
          'Finito il camp premi «Segna come conclusa»: le famiglie ricevono il questionario. Non si torna indietro.',
        ],
      },
      {
        title: 'Valutare una candidatura',
        steps: [
          'La Panoramica ti dice quante candidature aspettano, per lo staff e per il v-team.',
          'Apri la persona da «Staff» o «V-team»: trovi i suoi dati e il CV.',
          'Approva o rifiuta la candidatura. Le note interne la persona non le vede mai.',
          'L’email con l’esito non parte da sola: la mandi tu quando vuoi, con un messaggio che puoi cambiare.',
        ],
      },
      {
        title: 'Convocare staff e v-team',
        steps: [
          'Nella sessione apri la scheda «Staff» o «V-team» e premi «Aggiungi persone»: ti propone chi ha detto «Ci sono» per quella sessione.',
          'Dai a ognuno il ruolo nella sessione, coordinatore compreso.',
          'Seleziona le persone e premi «Invia la convocazione»: ricevono un’email e rispondono dal loro account.',
          'Se la sessione ha un contratto, chi accetta lo riceve da firmare. La convocazione è confermata quando l’ha firmato.',
        ],
      },
      {
        title: 'Far firmare un documento',
        steps: [
          'In «Documenti» carica il PDF con titolo, categoria e «da firmare».',
          'Assegnalo: a persone scelte, a tutte le famiglie, a tutto lo staff approvato, o alle famiglie o allo staff di una sessione.',
          'Ognuno riceve un’email e firma dal suo account con un codice.',
          'Nella pagina del documento vedi chi ha firmato, mandi i promemoria e scarichi le copie firmate.',
        ],
      },
      {
        title: 'Alloggi, gruppi e mensa di una sessione',
        steps: [
          'Alloggi: inserisci una volta i posti letto in «Alloggi». Nella scheda «Alloggi» della sessione dai un alloggio a ogni famiglia e alle persone dello staff; «Genera PDF dello schema» lo prepara da stampare.',
          'Gruppi: nella scheda «Gruppi», «Dividi le famiglie senza gruppo» le distribuisce fra Giallo, Rosso e Blu. Poi le sposti trascinandole e scegli chi guida ogni gruppo.',
          'Mensa: la scheda «Mensa» conta i pasti e raccoglie allergie e alimentazione. «Genera PDF per il fornitore» prepara il foglio per chi cucina.',
        ],
      },
      {
        title: 'Scrivere a famiglie o staff',
        steps: [
          'In «Comunicazioni» premi «Scrivi un messaggio».',
          'Scegli a chi: tutte le famiglie, tutto lo staff, le famiglie o lo staff di una sessione, persone scelte.',
          'Scrivi oggetto e testo, oppure «Parti da un modello». {nome} diventa il nome di chi riceve; con una sessione anche {sessione} e {date}.',
          'Guarda l’anteprima e invia: prima ti dice quante persone ricevono l’email.',
        ],
      },
    ],
    faqs: [
      {
        question: 'Perché una famiglia non vede la sessione?',
        answer:
          'Una famiglia vede una sessione solo dopo l’invito. In bozza non parte nulla: gli inviti partono con «Apri gli inviti», o subito se aggiungi la famiglia a una sessione con gli inviti già aperti.',
      },
      {
        question: 'Una persona dello staff vuole cambiare la disponibilità',
        answer:
          'Dalla sua pagina premi «Riapri la disponibilità». Le sue risposte restano, le può cambiare e confermare di nuovo, e riceve un’email.',
      },
      {
        question: 'Perché un’email non è ancora partita?',
        answer:
          'Al giorno partono al massimo 100 email. Le email normali usano le prime 80: le altre restano in coda e partono da sole appena si può, fra le 8 e le 20. Le ultime 20 sono tenute per i link di accesso e i codici. Il registro in «Comunicazioni» dice lo stato di ogni email.',
      },
      {
        question: 'Chi vede i dati sulla salute?',
        answer:
          'Solo l’amministrazione, nella pagina della famiglia e nella scheda «Mensa» della sessione, e ogni lettura resta registrata. L’elenco delle famiglie e i file scaricati non li mostrano.',
      },
      {
        question: 'Come cambio le domande del modulo «Dati della famiglia»?',
        answer:
          'Da «Famiglie» apri il modulo: aggiungi, togli e riordini domande e sezioni, con l’anteprima come la vede la famiglia. I dati sulla salute non vanno lì: stanno nelle schede dei componenti, con il consenso.',
      },
      {
        question: 'Come cambio il testo della liberatoria?',
        answer:
          'Da «Famiglie» apri «Liberatoria». Il nuovo testo vale per le liberatorie che si rifanno da lì in poi; per farle firmare tutte di nuovo usa «Chiedi la firma sul nuovo testo».',
      },
      {
        question: 'Una persona non riesce a entrare',
        answer:
          'In «Utenti» cercala e, dal menu della riga, mandale di nuovo l’invito o il link per la password. Se l’account è disattivato, riattivalo da lì.',
      },
      {
        question: 'Posso tornare indietro dopo aver concluso o annullato una sessione?',
        answer: 'No. «Segna come conclusa» e «Annulla la sessione» sono definitivi, e prima di farlo te lo chiede.',
      },
    ],
  },
}
