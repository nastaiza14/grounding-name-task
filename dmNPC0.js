import { assign, createActor, setup, fromPromise } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure.js";
import feedback from "./feedback.json";
import sentences from "./NPC1.json";

const inspector = createBrowserInspector();

const azureLanguageCredentials = {
  endpoint: "https://mlt-dia-convlang.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview",
  key: "8e916cc89cb341998503a020aef8f43f",
  deploymentName: "appointment",
  projectName: "appointment",
};

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings = {
  azureCredentials: azureCredentials,
  azureLanguageCredentials: azureLanguageCredentials, //!
  asrDefaultCompleteTimeout: 100,
  asrDefaultNoInputTimeout: 4000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-EmmaNeural",
  speechRecognitionEndpointId: "cfb8186f-75ed-46ae-a0d8-4d8d463f3540"//"c28746b8-2cad-48aa-ada0-7aba121e1ede"//"353f01c2-b749-463a-98e2-8ff7f0f29484"//
};

const prompts = ["What did you say child? My ears are no good", "Repeat that Miss", "What did you say?.", "I can't hear for the love of me"]

const reProperName = /\ [A-Z][a-z]*\ [A-Z][a-z]*/;

const reProperNameOnly = /[A-Z][a-z]*\ [A-Z][a-z]*/;

const reSpell = /[A-Z]{2,}/;

const punctuation = /[\.,?!]/g;

/* Helper functions */

function randomRepeat(myarray) {
  const randomIndex = Math.floor(Math.random() * myarray.length);
  return myarray[randomIndex]
};

//if bigger than 3... just going back automatically
function orderRepeat(myarray, count) {
  return myarray[count]
};


function checkScore(numero) {
  if (numero < 0.5) {
    return "LOW";
  } else if (numero < 0.7) {
    return "OK";
  } else if (numero < 0.9) {
    return "GOOD";
  } else {
    return "VERYGOOD";
  }
};

const conso1 = [
  "Qu", "Tr", "Pl", "Fr", "B", "E", "F", "G", "I", "K", "L", "M", "N", "R", "S", "T", "V", "Y", "Z",
];

const vow = [
  "a", "e", "i", "o", "u"
];

const conso2 = [
  "ll", "v", "th", "r"
];

const givenName = ["Egbert", "Egon", "Ehren", "Ehrhard", "Eike", "Eilhard", "Eitel", "Ekkehard"];

function randomNameGenerator() {
  const RandomOnset = conso1[Math.floor(Math.random() * conso1.length)];
  const RandomCore = vow[(Math.floor(Math.random() * vow.length))];
  const RandomOnset2 = conso1[(Math.floor(Math.random() * conso1.length))].toLowerCase();
  const RandomCore2 = vow[(Math.floor(Math.random() * vow.length))];
  const RandomCoda1 = conso2[(Math.floor(Math.random() * conso2.length))];
  const RandomGivenName = givenName[(Math.floor(Math.random() * givenName.length))]
  return RandomGivenName + " " + RandomOnset + RandomCore + RandomOnset2 + RandomCore2 + RandomCoda1
};

function randomNum(max) {
  return Math.floor(Math.random() * max);
};

function utteranceMatch(anArray, aString) {
  // for/within an "anArray" there is some "phrase" that "aString" includes such "phrase" = True
  return anArray.some(phrase => aString.includes(phrase))
};


function spellingMatch(spellingRe, properName) {
  let spelllower = spellingRe.toString().toLowerCase();
  console.log(spelllower)
  for (let index = 0; index < spelllower.length - 1; index++) {
    console.log(spelllower.substring(0, index + 1) + " " + spelllower.substring(index + 1))
    if (spelllower.substring(0, index + 1) + " " + spelllower.substring(index + 1) === properName.toLowerCase()) {
      return true
    }
  }
  return false
};


/* Generates a random name for the session: */
const randomName = randomNameGenerator();

/* Test for common name grounding. */
//const randomName = "John Smith"

/* Test a fixed name. */
//const randomName = "Atel Zimer"

console.log(randomName)

const dmMachine = setup({
  context: {
    paraphrase: " ",
    spelling: " ",
    spellreaction: " ",
    propername: " ",
    reaction: "hmm...",
    counter: " ",
    state2counter: " ",
    propernamefailure: 0, // this could be used as a context where strings are compared somehow
  },
  actions: {
    // After defining these Xstate visualizer gets buggy.
    say: ({ context }, params) => {
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: params,
        }
      })
    },
    listen: ({ context }) => {
      context.ssRef.send({
        type: "LISTEN",
        //value: { nlu: true } 
      })
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6AhgVwB7oDkB7ACTEwCcBLAOygGIBlABQFEBBAaQH0BhAeVTMAMqwAqrANoAGALqJQAByKwqAFypEaCkLkQBWAEwAaEAE9EADgCM6ACwBOJ5aeGX16wDZ9AXx+m0LDx0AFUaAGsaIgB3GjEiRSoAYyY2Lj5BEXEpOR1lVQ0tHT0ETxNzRGsAZlsnZzsAdmk7aSaqzz8AjBx8YjCIMApYNUwaCFoGFg4eASFRCRl5JBB89U1tZZKG8osEa0tDezqGh0aHQ0MHVs6QQIBbTFp0ZgowRUowenZGACUxMUY3B+HGQAE1FnkVGsiptEIZvOgHPoqvDDNIag4Gp4HKZdvp9LYTliGvi7DZ9h1-LcMA8ngB1R5qeKMEYUNT0XjCACSvE4EOWq0KG1AJX0lk86GsSKq0nFaM80k8VVxBgJ6CJCpJVUxdhqN3ujxo6AA4q8wBo6Klphk5tl+UooULilZ9A51WKpfjtljDNYVQh9Ir0FVLK1DK7pA5rCTrPqaYb0FyaGowMn1rwABZgJLhejAgTGghcxisZD2laO9bOhAtFrB6pkrx2Dwkhr+6zSQx2dD6LF2S5lTwHByWOPoWlGpMptNaTPZ3P5-iF4ulyTWJYOgpV2E15rSetVRueZvR3v+8W2AmeBoeKqBhrNqpjieJ5OpoVznNfX7cAj8LkEMwIRiOWgrbiKiC1vuNSHjYx4tmeFR7Fitghl2lh2LWljik+VIGk87A0LA0SDNYVrpLMWQLLkAqVjCEE1i2PbSJG5xIhclj+ucliSoYKKeJ4+y9oYWLPgmhHEYMhjkTMmTzDkG4Vlu9G6JBjQ8f2lyXJhSqduegk9l4N7VPej5iQRREkRQVQyTaVEKZCynCqpNZGFU9iCdhzYuI4fpITeDTqgJBwNBhTgCbGeHxk8YSRDENDMIMsBaLZlHyaBdHOSUaIOO5ob6EOMq6g0h76P64YHIivqhtILZOCS5lGrFUSxPEiQpFMFFyXaNGbtCWWVPo-boOKfZVFUDShS4-oTTxljjRc97InxDiNegLKYCmZGLsuJZlr1Sn9dW1h2AiQ61SiirXhhdjlRc7k1HxrT7Bc2INGtG1bXmrAFkWe1ropYEqSUJ1naG1TytdmHlRiQUFQSmJXHYH0jF9O1-auhiA5lx2nfo6DnRDV2hdDSFdl46DVTYQ1oidhgo5tYDbT9S4Y2WVTY05uNgxdkMk7dZPWPCI1ig4ZQhkN4UM2jLO7audic0dO6g-jhOXQJ-MzUY+MnNeE2RgcXi+FF44Jp9TPfb9K5lvoitOsreME+D6tQwLuxuGLPahULuqWJNNjSxb6PW5Inh2+BLkq07vPEzd5VOO56IeIqjQotYxtdKbTzm8zVv-Q04fA5Ujtq3zcdITKLj2BhsqWPi4pkpSmcvjnlusyHliFwNewl87Zek7sNR14iE26uNpL7KOJst6jQey2zkgOF33Oq33scD4gE2e+ngkhiddhDaJ09m7Puft-9HbLw7PNExr5eD24hzas06eYbKyK4c3J+M2fctlh4V8GJR1LuvN2cJ0T7haK6UMMoWLeAztSLORpW7BwvljRySsgG9xjnfDeCA3AsV4o0E4roOweEDr-Be1RAGR2wbfV25U2gEwCpiQMXprwULbn-NcCsMH2ywTfF2mskL9jdONNOI5AxknhMjY+2dT7fh+L+f8gFgIZS5juRwk0CZi2jCiEcLgST+iMJeeaFwuxlCuJ-RBL4ABiYBIAACNMA5lbp1WStpqI0JKHXN0JIbBImEj6PyuwWj7mwq0Sa+JPTbEDtJdxdl0oHSBt3V+hxRrHnGv7aaFdZojWKgqPiPpDxrWEFQYYqZzbSVQauZJONr6rxwQwkRtdJQFRlFcNhKJZFfyeGUipNAqlcKod44ugj+5gIQO0Jw6pOwnHGsQyapTynTiGTUss6DaIaIEY0+hwjB6iODMVfEtURIHB6TYhM-TVmz2qfPEOHM+ERxBnQoR99N7HjdGiESkjtieSbpcvpKzKm3OGSHXhWzMG0PGaA-03luwKjYreV0AkEH4SNNckFjM7l51XLbJ5Rcaxi0CtiQSJVLjYVYXCm86BZQohEkOSamE0XRQxcCwZoLvhKL-ABICIE6nbJcloklujyUGKpSIxw3ZFQXHJb6C56L1qzzsKlbqXiCWpNYYibEHgLhXFDDiCue5gzNF1C0B8w53pyOQcq1VnipDrg1cdLVYsoxC0uLKSM7Y049iRLlEq-j1KB30Ha+y6ioUlEroFea14CS9jFtqSZ2ptQjQODYaQNNcrhmWQM82Ib1nhv4S5O8BlLh9i7GhAqSb3CUwKiJIk2pLg5puYzfN9yL6jKmQVWwZbjwVoOFWmaI5ApNHOAqDNuUlTWMVZijlrawX-U2X1Itkbu2U0xH2324ZjxwpOqvXeQ16V6mtegWdeaF2rkeZCldkEkQirJfoylRiRFoh7GY-RQsxQAsVebTwoakmdqggeI8J5Wy7qHATQcHq-btCnr0tlubZ5-oLQKiNalQr2D1dpU6ModiQWqLYXUrpum9gtc2rFKZkPttXI669zzb2NB0Q+ilhiyoVyaLS99NhR4iSGoHBo-6eqAbch5Se3lThRnbFmgm3SsQFR9Aq1lp72XmwEyhztUoSTardXqz1hrdjuvxnTQJHrHxWvg8pxDjM1PUf-hpl1Or3X6q9f5AyzZvDYTFN5Ls5G50phs7ijZ9mtOut1dBlz7tozdgho0BsZzs0nrPbPAL59L3BfxqFpzen466hFnuqULhtQFV86pi9ZYIXLvo0SiaTG9EsYlYPKUb7unjTKPCK436lNJes4o5RvK1GoZvXsBzOnwv6cQDefcUZvC5QNZ2EMJXku9Z5aokCtHKuEuFbVsVT62N4m2JxtO2wQyKilIHSwgn1V0cJV2EcOjXRIlDFAyZPseIeFOGSU4+I42LcZhd9TTqdxRpGu0GM8alSnHbASWwgks0jnGp0uDgKEMtpTP92zANAcMWBzGsHutE3tgVDxMMNQpRSgR6tRLKnZ7o8C5IJdh0hs49B3G-HkOkLzRh6it1YsFTTq69Tv7y2VF8sLVV5nsb05s8mdhQ4XgPOugCmURTSDLOo7ABdrlfXVuY+u93Ah+54RKghwnbW7YvBulhwVfKN4xYq5nozGyCS0pCax5HEbYXnPjamZ8ymczfnwgpL9lMNkAd6+rLdni2IHtij3ENb1VwRrYgWjpfinXVfdZD2V3XG39eOCj36x7cek1OGgmmjNQ9IyRQs5nsAoeMcM5SRH-P92nCx+e3CmU+M7zcTrnxIa6eXy15slrlbovBtVcj63ovHeK65TdLL9NmaUQsoz4LrPo+RdqPW4zyfLfo9t6exml7zQ5rR6aAJUV1fkdq4o3X4X-WQKN-qQxLbpK6viufaEzC7k61nJ0uTGtKaEQNgGMJAObJdg5OHkDmur2v2FuoOkhJ0pKLqK0GLPCC4JiGtMQGoD8GAAADZgAABuow7IzuaqUBue1YJaPaG68BlaO6-kws80h4SoB8tUJUa0vApBZAlAkBYum2TEgYrElwRgbg7Y5IqaXYJw+wLEmESOiqyAWgnwnIPIfIE+hKX6ko0osoZQioioyoIiUY662wwhy0jgiofgVIUQAw8AywaAbuJQkyAAtBKCxO4R4R4W4GOD0I4QYKiJTKikTjIXXHdIFHxAtENCxD7Onj0IQKQOQNQHQH4QGJdJKJgacDhEYN7trOqAtELM0IeNsNfoEHEc1PFG1MkCkciNGPYEbKLJ2CFHCq+hEfCLBmUDTKvnEX0GAUMCMGMBMNUTUIbkEbKCEXtpvCdHkeNOnPouiEqI1NUd7m4N2LdhuuKOdBhGtBmCsikbqnCkNOqDqBhEVicAHCei8G8B8Hsa0MYunEcX2BhMnK0Kvi+AyOoMyKyGoCkTpJTP2DUNsL6CJPCMYkYCYd4G4KFAJLVEAWaBaFACkdiDxF6G0LKG4KESIvNMGKGPNIjIrl9mtFOO+OmFmDmCkSGHWM9EZDGJNIYbsDeDxNNn7PsBNP3q8eJJZKRD8bDGMXAkiKdOcFxJhLSkbOcCtJGPiGtBJFZIYNyRcPYJXDKMeNiE4OeCGIZEOOGEUkNJKSetKYMFUD8SSPjM0KFCOGTlcHhggJNk7IeI3KivNOZjfuUbEIlEMCpE3juHqt3lGAsgsjYOVPiG6OcHVp8g2GtC6XEAkFUdAUAn2PYMiN4CVDAixG2OxoSI4LziQtsKmRQjcQZHaTlL2ASCVN7o2tqt5MRlcFKGLGtPYk4i4uEDnIiVXG4OnKcNqPvLqDNNohEpNnSpGBLHEnsfGQfO0L2CdrAmmY1liY+L4kNBbvzmvlZimLKbGZHKdkcv2BKTSdqDNCGIFCdGxH7Jqa-IHHYCOdePYIObiTYLFp4HdCiMGCGOcFiIEnIcGikW4AqPkgfEYKdNeNeNOZvNNlIQ+DKA+IqJTjXuvmAPoOSVvCNFGLqNUD3mSEOhTLLuBa0C0NiIHJ4OSRhGfjYMyaIsSLugfJBtul4EJBmsHmAAReuU4TyX7HyQPoKSInulRd2p5GwvxkafiLSupOaVGJaeVKGIcAqNUMyfoh-PRQ0JeTDjMYYk4AVg+f5OiCDmnKdNus2PTCeubJYF+bAj2KSB0uGKye2ItJKJpphJPJ2PblcrBUZUxXCL4tiT3t4LqNiIqFZeGDZUiGUO+vXIHIaa5chAJMws0G5KTicDNIOH7pcD7K6P8fRWFVQV6UqQTIGBZQfGFAVPFcLN8lGF2ClXxLCSAWARAObAhViATB2AyoVjvOeJVHTPNJ6nxEOI5U8DgXgYQSQcmAhblATI4KDjMfCLcRpXlPkTpVWkLFwTwYkdyU1ryVBexVaaeISCOCOChZNNIWtEoTQGAD8acJKAFBSJ2GiDpHCsYUSOGCxOYeKFYT4EAA */
  id: "DM",
  initial: "main",

  states: {
    aux: {
      initial:"NoHearing",
      states: {
        NoHearing: {
          entry: {
            type: "say",
            params: `${randomRepeat(feedback["npc-clarification-request"]["general-request"])}`
          },
          on: { SPEAK_COMPLETE: "#DM.main.hist" }
        },
        UnknownTopic: {
          entry: {
            type: "say",
            params: `Excuse me, but I do not know what you talk about Young Miss `
          },
          on: { SPEAK_COMPLETE: "#DM.main.hist" }
        },
        NoUnderstanding: {
          entry: {
            type: "say",
            params: `${randomRepeat(feedback["npc-clarification-request"]["general-request-2"])}`
          },
          on: { SPEAK_COMPLETE: "#DM.main.hist" }
        },
      }
    },

    main: {
      initial: "Prepare",
      states: {
        hist: {
          type: "history"
        },
        Prepare: {
          entry: [
            assign({
              ssRef: ({ spawn }) => spawn(speechstate, { input: settings }),
            }),
            ({ context }) => context.ssRef.send({ type: "PREPARE" }),
          ],
          on: { ASRTTS_READY: "WaitToStart" },
        },

        WaitToStart: {
          on: { CLICK: "Greeting" },
        },

        Greeting: {
          entry: {
            type: "say",
            params: `Miss, what are you doing up so late?`,
          },
          on:
            { SPEAK_COMPLETE: "State1"}
        },

        /* Detecting intention */

        IntentionCheck: {
          entry: {
            type: "listen",
          },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("open the basement"),
                target: "Answer1",
              },
              {
                guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("how are you"),
                target: "Answer2",
              },
            ],
            ASR_NOINPUT: "CantHear",
          }
        },

        Answer1: {
          entry: {
            type: "say",
            params: `I'm afraid I cannot do that`,
          },
          on:
          {
            SPEAK_COMPLETE:
            {
              target: "State1",
              actions: assign({
                random: randomNum(2),
              })
            }
          },
        },

        Answer2: {
          entry: {
            type: "say",
            params: `Well, I'm fine Young Miss`,
          },
          on:
            { SPEAK_COMPLETE: "Answer3" },
        },

        Answer3: {
          entry: {
            type: "say",
            params: `What shall I assist you with?`,
          },
          on:
            { SPEAK_COMPLETE: "IntentionCheck" },
        },

        UnknownPerson: {
          entry: {
            type: "say",
            params: `My apologies, but I do not know who you talk about Young Miss`//${randomRepeat(feedback["clarification-request"]["general-request"])}`
          },
          on: { SPEAK_COMPLETE: "State1" }
        },

        UnknownTopic: {
          entry: {
            type: "say",
            params: `Excuse me, but I do not know what you talk about Young Miss `
          },
          on: { SPEAK_COMPLETE: "State1" }
        },

        // NoHearing : {
        //   entry: {
        //     type: "say",
        //     params: `${randomRepeat(feedback["clarification-request"]["general-request"])}`
        //   },
        //   on: { SPEAK_COMPLETE: "State1" }
        // },

        /* The speaker utters a Name and the listener detects it, triggering grounding mode for the Name in question.
        The listener 
        Susequent user interactions are not allowed in this implementation, if the speaker (user) elicits an acknowledgment 
        after a name, and the name is correct, the listener (machine) will interpret the name. 
        This means that the state S to 1 (name) doesn't get the intermediate state 3 (acknowledgment by speaker) and then 
        goes to F, but it goes directly to Ex: John Smith... yeah.
        */

        /* STATE 1
         Extremely naive Name + Surname detection, look at object reProperName (regex).
         It detects two words starting with caps preceeded by spaces.
     
         WARNING: TIMEOUT MAY INTERFERE HERE AND NOT CATCH THE SENTENCE for some reason in conditions */

        State1: {
          entry: {
            type: "listen",
          },
          on: {
            RECOGNISED: [
             
              /* TO STATE 4
    
              Name + spelling offer.
    
              User needs to match the request with the strings in "spelling-offer".
    
              If Confidence Score is VERYGOOD, GOOD or OK, reject request for spelling.
              If Confidence Score is LOW, go to State 4 to react to it, and then go to State5 for spelling or State8 for acceptance.
    
              Accepting represents lack of understanding of the name, refusal represents that the name has been understood.
              That is represented by confirming that the name matches with the randomName generated ✅ */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName && utteranceMatch(feedback["clarification-request"]["spelling-offer"], event.value[0].utterance) && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD" || checkScore(event.value[0].confidence) === "OK"  ),
                actions: assign({
                  spellreaction: "No, that's perfectly fine",
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                }),
                target: "State4",
              },

              /* Name + spelling offer.
    
              A name was understood, the name matches with randomName, but clarification is needed because the confidence LOW.
              This represents that the system is not "sure" that it is the name. 
              At the same time, it represents that the user needs to speak more clearly or in better environmental conditions. 
    
              Unlikely scenario if the environmental conditions are good. ✅ */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName && utteranceMatch(feedback["clarification-request"]["spelling-offer"], event.value[0].utterance) && checkScore(event.value[0].confidence) === "LOW",
                actions: assign({
                  spellreaction: "Okay",
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                }),
                target: "State4",
              },

              /* Name + spelling offer.
              The spelling request is accepted because the name does not match, (no matter the confidence, it was good enough to understand both name & spelling)
              */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && utteranceMatch(feedback["npc-clarification-request"]["spelling-offer"], event.value[0].utterance),
                actions: assign({
                  spellreaction: "Okay",
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                }),
                target: "State4",
              },

              /* Name + spelling offer.
              The spelling request is rejected because the name does not match and the confidence is OK or LOW */
              // {
              //   guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && utteranceMatch(feedback["npc-clarification-request"]["spelling-offer"], event.value[0].utterance),
              //   actions: assign({
              //     spellreaction: "Okay",
              //     propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
              //   }),
              //   target: "State4",
              // },

              /* TO STATE 3
    
              Name detected. No conflict (the name matches).
    
              This is the most unlikely (although not impossible) scenario with the given ASR and our randomly generated names.
              The verbatim repetion of the name is, then, uttered as an acknowledgment */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD" || checkScore(event.value[0].confidence) === "OK"),
                actions: [
                  assign({
                    propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                  }),
                  // Revise if this is natural
                  ({ context }) => feedback["npc-clarification-request"]["acknowledgment"].push(context.name),
                ],
                target: "State3",
              },

              /* In case the name matches but the confidence is not so good, different type of feedback is given.
              Here an acknowledgment is expected in State 2 */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName && checkScore(event.value[0].confidence) === "LOW" ,
                actions: [
                  assign({
                    paraphrase: ({ event }) => reProperName.exec(event.value[0].utterance) + ", " + randomRepeat(feedback["npc-clarification-request"]["confirmation-request"]),
                    propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                  }),
                ],
                target: "State2",
              },

              /* TO STATE 2 
    
              Name detected. Conflict (the name doesn't match). 
              
              This is not fully about "understanding" in this representation, but the agent's attitude towards the content it "understands".
    
              A name is detected but it doesn't coincide with the name generated in randomName.
              The repetition of the (interpreted) Name is, then, used as a paraphrase-acknowlegment, pending of confirmation.
    
              The feedback given relies on the Confidence Score.
    
              According to the network in Bondanrenko (2019), a confirmation-request alone can be triggered at this state.
              However, it does not seem to make much sense without a prior object to confirm, therefore we add the paraphrase first. */


              /* VERYGOOD confidence presents a verbatim repetition (paraphrase) and expects confirmation/repair.
              If confirmation -> it can be declined (REPAIRED)  */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && checkScore(event.value[0].confidence) === "VERYGOOD",
                actions: [
                  assign({
                    paraphrase: ({ event }) => reProperName.exec(event.value[0].utterance) + ", " + randomRepeat(feedback["npc-clarification-request"]["confirmation-request"]),
                    propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                  }),
                ],
                target: "State2"
              },

              {
                /* GOOD or OK confidence offers a paraphrase, but the Name does not match, otherwise we would just go to State3 to get an acknowledgment
                That's why, if you test "Mary Smith" this guard will check.
    
                To receive a clarification for this we need a more advance technique for NLU.
    
                Larry Smith -> S: "Mary?", U: "Larry", we need to recognize if the new information said by the user is updating or not
                
                If the updated version matches, we move to State3
                If it is recognized as the same we re-enter the state up to 4 times.
                If we re-enter the same state after 4 times, we just say "nevermind" and the task ends: "I don't know what you are talking about" */

                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && (checkScore(event.value[0].confidence) === "GOOD" || checkScore(event.value[0].confidence) === "OK"),
                actions: [
                  assign({
                    paraphrase: ({ event }) => reProperName.exec(event.value[0].utterance) + "?",
                    propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                  }),
                ],
                target: "State2"
              },

              // In practice, these two seem a bit too strong for an "OK" score

              {
                // Repeat-request (1) or request-spelling (0) request selected randomly, both in low confidence score (understanding) 
                guard: ({ event, context }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && checkScore(event.value[0].confidence) === "LOW" && context.random === 1,
                actions: [
                  assign({
                    //change name to "repeat-request" if time permits lol
                    paraphrase: randomRepeat(feedback["npc-clarification-request"]["repeat-request"]),
                    propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                  }),
                ],
                target: "State2"
              },

              {
                // Repeat-request (1) or request-spelling (0) request selected randomly, both in low confidence score (understanding) 
                guard: ({ event, context }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && checkScore(event.value[0].confidence) === "LOW" && context.random === 0,
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                }),
                target: "State5"
              },

              /* To State 7 
              If Name is detected and spelling is detected too.
              Spelling determines the more accurate understanding, whereas the name detection just serves as an indicator of grounding mode.
    
              Similarly to transitions to State 3, the Confidence Score will determine the type of reaction.
              This is determined in State 7.
              Determining if the name matches also happens in State7. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                }),
                target: "State7"
              },

              /* TO STATE 7
              Only detecting spelling. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7"
              },

              
              //Let see about this again:
              
              { // clarification request about a name
                guard: ({ event }) => reProperName.exec(event.value[0].utterance),
                target: "UnknownPerson",
                actions: ({ event }) =>  console.log(reProperName.exec(event.value[0].utterance),)
              },

              // perception level error
              {
                target: "UnknownTopic",

              }
            ],
            // contact level error
            ASR_NOINPUT: "#DM.aux.NoHearing",
          }
        },



        /* Feedback of State 1
        Before going back to State1, we need feedback (listen + listen is not suported in this system).
        Here we acknowledge that some name has been heard for State1.
        If the name equals the answer, then it should proceed to State3. */

        FeedbackState1: {
          // We need this state because we cannot do listen + listen, and then we need conditions in State 1 regarding previous 
          // misunderstood name: S1 "Etel Zimmer?"-> S2 No it's actually "Aethel Zimmer"-> condition for checking propername detected here
          entry: {
            type: "say",
            params: ({ context }) => `hmm...`
          },
          on:
            { SPEAK_COMPLETE: "State1" },
        },

        /* Say feedback belonging to State 2 according to Confidence Scores.
        State 1 is partially adapted here. */

        State2: {
          entry: {
            type: "say",
            params: ({ context }) => `${context.paraphrase}`
          },
          on:
            { SPEAK_COMPLETE: "ListenState2" },
        },

        /* TO STATES 1 & 3
    
        A correction of the name is expected, whether it matches or not is checked in State3.
        
        Recognizing a clarification sentence is more elaborate than just selecting specific content, we need sophisticated NLU or phonetics.
        Aproximate understanding such as (Randaunphel) -> run down hill, also needs sophisticated NLU. 
        Another way one could do this is by detecting a word and blindly expecting it is a proper noun repair... */

        ListenState2: {
          entry: {
            type: "listen"
          },
          on:
          {
            RECOGNISED: [

              /* TO STATE 5
              Our modification (!) ** ** ** ** ** ** ** ** ** ** **:
              We need spelling after multiple repetition, coming from transition to State 2 after hearing a name with good confidence, but it being wrong */

              {
                guard: ({ event, context }) => context.propernamefailure >= 3,
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1) ,
                }),
                target: "State5"

              },

              /* Our addition: Not in this basic version.
              TO STATE 7
              Some spelling is recognized, the name does not match. A partial name should be detected here too. */

              // {
              //   guard: ({ event, context }) => context.propername !== randomName && reSpell.exec(event.value[0].utterance),
              //   actions: assign({
              //     spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
              //   }),
              //   target: "State7"
              // },

              /* TO STATE 3
               Recognizing name again and updating it.
               If the name now matches, we proceed to State3. There, an acknowledgment is given from the agent. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName,
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                  paraphrase: ({ event }) => reProperName.exec(event.value[0].utterance)[0] + "?"
                }),
                target: "State3",
              },

              /* TO STATE 1
              If the name still doesn't match, it goes back to State1, passing thorugh feedback first. 
    
              To take into account here is that in this new iteration the assumption is that the user should focus on the name, 
              and not provide an entire sentence that contains it, unlike in the first iteration. However, even if it is like in the first
              iteration, that does not bring problems to the system.
    
              Feedback here should be NEGATIVE, requesting for some sort of repair, we use repeat-request. 
              Skipping State 1 and going to State3. 
              This is an expansion of Bondarenko's (2019) network. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName,
                actions: assign({
                  propernamefailure: +1,
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                  paraphrase: ({ event }) => reProperName.exec(event.value[0].utterance)[0] + "?"
                }),
                target: "State2",
              },

              /* Recognizing acknowledgment after the repetition in State2 and jump directly to State 3, 
              Since the name seems to be recognized. 
    
              In conflict with the state-machine, if we have already a name in context that means we should be already in Stage 1.
              But we have decided to adapted like this for this system: it goes to State3. There, it will be rejected. */

              {
                guard: ({ event }) => utteranceMatch(feedback["acknowledgment"], event.value[0].utterance.toLowerCase()),
                target: "State3", //this should ground a part of the utterance
              },

              // If "no" detected, spelling or clarification is needed. This is not in Bondarenko's (2019) network.

              {
                guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("no"),
                target: "State5", 
              },

              
              {
                target: "#DM.aux.UnknownTopic"
              }

            ],
            ASR_NOINPUT: "#DM.aux.NoHearing",
          },
        },


        /* TO STATES 5 & 8
        
        Refusal or acceptance of spelling request. */

        State4: {
          entry: {
            type: "say",
            params: ({ context }) => `${context.spellreaction}`
          },
          on: {
            SPEAK_COMPLETE: [
              {
                guard: ({ context }) => context.spellreaction === "Okay",
                target: "State5"
              },
              {
                guard: ({ context }) => context.spellreaction === "No, that's perfectly fine",
                target: "State8"
              }
            ]
          }
        },

        State5: {
          entry: {
            type: "say",
            params: `${randomRepeat(feedback["npc-clarification-request"]["spelling-request"])}`
          },
          on:
            // or ListenState5? ListenState7?
            { SPEAK_COMPLETE: "ListenState5" },
        },

        ListenState5: {
          entry: {
            type: "listen"
          },
          on: {
            RECOGNISED: [

              /* TO STATE 7
              Name detection + spelling detection.
    
              Not checking if name is correct here, that's for State7.
              Here the name and spelling are detected, so it jumps right over to State7 without passing through State6.
              "context.spelling" is either created here. NO, false-> (if coming from State1) or updated (if coming from State5) here. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reSpell.exec(event.value[0].utterance),
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance),
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7",
              },

              // /* TO STATE 7 
              // Spelling detection. (!)

              {
                guard: ({ event, context }) => reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7",
              },


              /* TO STATE 6
              Name detected.
              State 6 involves giving some feedback because we can't do listen + listen. After that, the name should be spelled again
              in State7 -> ListenState7. This is a very specific transition in Bondarenko's (2019) network. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance),
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance),
                }),
                target: "State6",
              },

              {
                target: "#DM.aux.UnknownTopic"
              }
            ]
          },
          ASR_NOINPUT: "#DM.aux.NoHearing",
        },

        /* TO STATE 7
        
        Giving feedback on receiving a name and waiting for spelling. */

        State6: {
          entry: {
            type: "say",
            params: `right...`
          },
          on: { SPEAK_COMPLETE: "ListenState6" }
        },

        ListenState6: {
          entry: {
            type: "listen"
          },
          on: {
            RECOGNISED: [

              /* Waiting for spelling to move to State7 and update context.spelling. */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7",
              },

              {
                target: "#DM.aux.UnknownTopic"
              }
            ]
          },
          ASR_NOINPUT: "#DM.aux.NoHearing",
        },

        /* TO STATE 8
        The agent is going to repeat the spelling that it has heard or acknowledge it depending on Confidence Score
        It won't paraphrase it. 
    
        >>We give the opportunity first to the speaker to continue spelling, if not, the machine continues
        Since listen after listen can't be done, we first add a silence. --> This could not be done, so timeout. */

        State7: {
          entry: {
            type: "say",
            params: `${randomRepeat(feedback["npc-clarification-request"]["feedback"])}`
          },
          on: { SPEAK_COMPLETE: "ListenState7" }
        },

        ListenState7: {
          entry: {
            type: "listen"
          },
          on: {
            RECOGNISED: [

              /*TO STATE 5: In timeout
              If the name doesn't match with the spelling given, we wait for timeout to send a spelling request again */


              /* TO STATE 8
              Name matches, good confidence.
              An acknowledgment should be given (continuer).
               
              The option for some continuation of the spelling process, such as from State5 or State6 here is not implemented. 
              This is simply giving the user the ability to repeat their spelling. */

              {
                guard: ({ event }) => spellingMatch(reSpell.exec(event.value[0].utterance), randomName) && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD"),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State8"
              },

              /* TO STATE 8
              Name matches, but the confidence is not very good.
              
              The system reacts with a verbatim repetition of the spelling. If the user reacts with some repair, it leads to State7 again, 
              if they don't react, epsilon moves to Grounded State through State8 timeout. 
    
              If the user reacts with an acknowledgment (continuer), it leads to State7 again, 
              timeout is there as well, checking whether the name matches. */

              {
                guard: ({ event }) => spellingMatch(reSpell.exec(event.value[0].utterance), randomName) && (checkScore(event.value[0].confidence) === "OK" || checkScore(event.value[0].confidence) === "LOW"),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  reaction: ({ event }) => reSpell.exec(event.value[0].utterance) + "?",
                }),
                target: "State8"
              },

              /* TO STATE : "I don't know what you are talking about"
              Name doesn't match, but the confidence is very good. Grounded but incorrect. ✦ Explain logic for this ✦ */

              {
                guard: ({ event, context }) => spellingMatch(reSpell.exec(event.value[0].utterance), randomName) !== randomName && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD"),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  //reaction: randomRepeat(feedback["clarification-request"]["repeat-request"]),
                }),
                target: "UnknownPerson"
              },

              /* Name detected, no spelling, uttered as confirmation. */

              {
                // If a proper name is detected, but no spelling, to State 5
                guard: ({ event }) => reProperName.exec(event.value[0].utterance),
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance),
                }),
                target: "State5",
              },

              {
                target: "#DM.aux.UnknownTopic"
              }

            ],
            ASR_NOINPUT: [

              //if nothing is recognized

              /* TO GROUNDED STATE
              First it should be checked whether the spelling matches or not from previous state  */

              {
                guard: ({ context }) => spellingMatch(context.spelling, randomName),
                target: "GroundedState"
              },
              // {
              //   target: "UnknownPerson"  //change this, we give them another try
              // }
              { 
                target:"#DM.aux.NoHearing",
              }


              //{
              // The confidence here will determine the answer in State 8
              // If the confidence is very good, an acknowledgment is given and we go directly to grounded state
              // Since we are ignoring the name and focusing on spelling, word-part is not taken.
              //guard: ({ context }) => checkScore(context.confidence) === "VERYGOOD",
              // actions: assign({
              //   //This is the reaction, probably should change the name in State3 for "paraphrase" to "reaction" for more clarity
              //   reaction: randomRepeat(feedback["acknowledgment"]),
              // }),
              // target: "State8"
              //},
              // {
              // If the confidence is good or ok, we give verbatim repetition of the spelling
              // guard: ({ context }) => checkScore(context.confidence) === "GOOD" || checkScore(context.confidence) === "OK",
              // actions: assign({
              //   //This is the reaction, probably should change the name for "paraphrase" as well to "reaction"
              //   reaction: ({ context }) => context.spelling,
              // }),
              // target: "State8"
              // },

            ]
          }

        },

        State8: {
          entry: {
            type: "say",
            params: ({ context }) => `${context.reaction}` //undefined even if defined in "context" in the setup
          },
          on: { SPEAK_COMPLETE: "ListenState8" },
        },

        /* Instead of going directly from State8 to grounding, some time needs to pass to check grounding. */

        ListenState8: {
          entry: {
            type: "listen"
          },
          on: {
            RECOGNISED: [

              /* TO STATES 7 & GROUNDED
              
              If name or spelling is detected, it goes back to State7, where corresponding values are updated
              either name or spelling. */

              /* Spelling is detected */

              {
                guard: ({ event }) => reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7",
              },

              /* Name is detected */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance),
                actions: assign({
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance),
                }),
                target: "State7",
              },

              /* Acknowledgment detected */

              {
                guard: ({ event }) => utteranceMatch(feedback["acknowledgment"], event.value[0].utterance),
                target: "GroundedState",
              },

            ],
            ASR_NOINPUT: [
              {
                guard: ({ context }) => spellingMatch(context.spelling, randomName), //same name as spelled
                actions: assign({
                  propername: randomName,
                }),
                target: "GroundedState"
              },
              // {
              //   target: "UnknownPerson",
              // }
              {
                ASR_NOINPUT: "#DM.aux.NoHearing",
              },
            ]
          }
        },

        /* Either an acknowledgment in the form of continuers or in the form of verbatim repetition
          Epsilon is assumed, and no possibility of acknowledging this acknowledgment is given 
          In incremental systems the possibility should be allowed 
          Again, it will not be the case that the system repeats the name or acknowledges again, no recursion needed here either */

        /* It is improbable that a random fantasy-like-ish name would be detected by the current ASR model right away, 
          as multiple tests have shown */

        State3: {

          entry: {
            type: "say",
            params: `${randomRepeat(feedback["npc-clarification-request"]["acknowledgment"])}`
          },
          on:
          {
            SPEAK_COMPLETE: { target: "ListenState3" },
          },
        },

        /* What to do in the case that the user does not follow grounding, and decides to completely change topic?
        We have to get out of the grounding mode and go wherever is fit, storing what has been grounded so far. */

        /* If time is out for the user to contribute, and the Confidence Score is not high, a spelling request is made.
        It could be said that, therefore, the previous acknowledgment (State3) was "weaker", a "continuer", rather than 
        an affirmation of sure understanding. */

        ListenState3: {
          entry: {
            type: "listen"
          },
          on: {
            RECOGNISED: [

              /* The user response has to contain one of the expressions in "acknowledments". */

              {
                guard: ({ event, context }) => utteranceMatch(feedback["acknowledgment"], event.value[0].utterance.toLowerCase()) && context.propername === randomName,
                target: "GroundedState",
              },

              /* If the name doesn't match but we get ancknowledgment */

              {
                guard: ({ event, context }) => utteranceMatch(feedback["acknowledgment"], event.value[0].utterance.toLowerCase()) && context.propername !== randomName,
                target: "State5",
              },

              /* Spelling is detected. */

              {
                guard: ({ event }) => reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7"
              },
            ],
            ASR_NOINPUT: [

              /* If name still doesn't match after timeout, spelling request is made in State5. */

              {
                guard: ({ context }) => context.propername !== randomName,
                target: "State5"
              },

              /* If name matches, grounding stage is reached. */

              {
                guard: ({ context }) => context.propername === randomName,
                target: "GroundedState"
              },
              {
                target: "#DM.aux.NoHearing",
              }

            ]
          }
        },

        GroundedState: {
          entry: {
            type: "say",
            params: ({ context }) => `${context.propername}, huh? <emphasis level='strong'> My, my. Quite the nosy child are you... </emphasis>`
          },
          on:
            { SPEAK_COMPLETE: "IntentionCheck" }

        },

        NotRelevant: {
          entry: {
            type: "say",
            params: `Well, I can't do anything for you regarding that`
          },
          on: {
            SPEAK_COMPLETE:
            {
              target: "IntentionCheck",
            }
          }
        },

        CantHear: {
          entry: {
            type: "say",
            params: `${randomRepeat(prompts)}`
          },
          on:
          {
            SPEAK_COMPLETE:
            {
              target: "State1"
            }

          },
        },

        Done: {
          on: { CLICK: "Greeting" }
        },
      },
    },
  },
})

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();


export function setupButton(element) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" }); //dmActor2.send({ type: "CLICK" }), 
  });

  dmActor.getSnapshot().context.ssRef.subscribe((snapshot) => {
    element.innerHTML = `${snapshot.value.AsrTtsManager.Ready}`;
  });
}


function getContextMessage(message) {
  const myDiv = document.getElementById("textDisplay"); // Get the div element
  const result = myDiv.textContent = message;
  return result
};


dmActor.subscribe((state) => {
  console.log(state);
  const message = state.context.message;
  getContextMessage(message)
  //console.log(chatContext.chatHistory.toString().replaceAll(",|", "\n"))
});

