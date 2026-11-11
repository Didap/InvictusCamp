CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
INSERT INTO "email_templates" ("name", "subject", "body") VALUES
('Convocazione staff', 'Ti aspettiamo a {sessione}', 'Ciao {nome},

ti aspettiamo a {sessione}, {date}.

Il ritrovo è [giorno, ora e luogo del ritrovo]. Porta con te [cosa portare].

Se hai un imprevisto scrivici subito, così possiamo riorganizzare i turni.

A presto,
lo staff di Invictus Camp'),
('Convocazione famiglie', 'Ti aspettiamo a {sessione}', 'Ciao {nome},

manca poco a {sessione}, {date}: ti aspettiamo al camp con la tua famiglia.

L’arrivo è previsto [giorno e ora di arrivo]. Ti consigliamo di portare [cosa portare].

Prima di partire controlla nel gestionale che i documenti siano firmati. Per qualsiasi domanda scrivi a famiglie@fondazionevannilongo.it.

A presto,
lo staff di Invictus Camp'),
('Promemoria documenti', 'Promemoria: documenti da firmare', 'Ciao {nome},

nel gestionale ci sono documenti che aspettano la tua firma: ti chiediamo di firmarli entro [data].

Li trovi nella sezione Documenti, dopo l’accesso.

Grazie,
lo staff di Invictus Camp');
