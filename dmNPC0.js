import { assign, createActor, setup, fromPromise } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure.js";
import feedback from "./feedback.json";
import NPC1 from "./NPC1.json";

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

async function fetchFromChatGPT(prompt, max_tokens) {
  const myHeaders = new Headers();
  myHeaders.append(
    "Authorization",
    "Bearer <>",
  );
  myHeaders.append("Content-Type", "application/json");
  const raw = JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
    max_tokens: max_tokens,
  });

  const response = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  })
    .then((response) => response.json())
    .then((response) => response.choices[0].message.content);

  return response;
};

const classifyIntent = `
This is a JSON object: {"intent": <intent>}. Please, classify the text according to the following 4 intents, bear in mind this is a video game setting: "information", "chitchat", "goal", "name" and "other". 
"information" refers to items in specific rooms in the mansion or background of the characters, "chitchat" refers to multiple open topics, "goal" refers to the player wanting to enter the basement, "other" is for anything else.
To get the intents, please, try to follow the following guidelines: 
The intent "information" should be selected when in the text they mention they want to know about an item or a room, or about the background story of either the parents or the housekeeper. I will give you a JSON object with some of these items and background information down below.
Please, select the intent "chitchat" when a general topic of conversation is presented. I will give you a JSON object with some chichat topics you may detect in the sentence down below.
Please, select the intent "goal" when in the text they ask about "how can I enter the basement?", "I want to enter the basement", "open the basement", etc. or if they mention they want to talk about "pictures", mentioned having seen pictures under the bed, etc.
Please, select the intent "other" whenever you cannot find a relation between the sentence and the keys and strings stored in the JSON objects. If you detect an item, a part of the mansion or a topic that is not in the JSON objects, please write after in the intent. See example.
Importantly, if you detect anything that resembles a name, spelling of a name, or the like, please put the value "name" in the JSON object as you will see in the example below.
To analyze intents, please, break down every text into sentences (separated by commas or dots), consider what every sentence says, and then give back an intent.

This is the JSON object containing information on items in the mansion and about background stories: ${JSON.stringify(NPC1.information)}.
This is the JSON object with chitchat topics: ${JSON.stringify(NPC1.chitchat)}

Some examples:
Text: "Do you know how I can open the cabinet?". {"intent": "information.mansion.dollroom"}
Text: "What have you been doing lately?". {"intent": "chitchat.work"}
Text: "Can you please open the basement?". {"intent": "goal"}
Text: "Do you know anything about Bor Veshur?". {"intent": "name"}
Text: "Do you know how I can open the safe?". {"intent": "other.safe"}
Text: "How can I go to the roof?". {"intent": "other.roof"}
PLEASE, ONLY REPLY WITH THE JSON OBJECT. DON'T USE QUOTES IN YOUR ANSWER. This is the text:
`

const classifyInfo = `
This is a JSON object: {"information": <information>}. Please, detect what the player may want information for in the text that I will give you. Use the JSON object below containing information on items in the mansion and about background stories to try and find what they may be looking for.
This is a video game setting where the user plays as the daughter of the sir of the mansion, the mistress of the house has passed away. The player is talking to the housekeeper in this scenario. 
Bear in mind that the player may want information about different items and characters but not be quite precise about it, because of this, try detecting the topic, an object or item, of the sentence and the place. 

If both the place and item can be found in the JSON object I will give you, please return a sentence that contains them.
For example, in a sentence such as "How old are you, lady?", return: {"information" : "backgroundstory.housekeeperstory[2]"}

In case there is no match, return the place and topic that you have detected in the sentence, in that order.
For example, in a sentence where there is a topic and a place: "Do you know how I can put out the fireplace in the library?", return {"information" : "library.fireplace"}.
For example, in the sentence where there is only a topic: "Where can I get a lighter or something similar?", return {"information" : "lighter"}.
For example, in the sentence where there is only a place: "Do you know how I can get to the attic?", return {"information" : "attic"}.

This is the JSON object containing information on items in the mansion and about background stories: ${JSON.stringify(NPC1.information)}.

PLEASE, ONLY REPLY WITH THE JSON OBJECT. DON'T USE QUOTES IN YOUR ANSWER. This is the text:
`

const classifyChitchat = `
This is a JSON object: {"chitchat": <chitchat>}. Please, detect what the player may want to chit-chat about in the text that I will give you. Use the JSON object below containing topics of conversation to try and find what they may be wanting to talk about.
This is a video game setting where the user plays as the daughter of the sir of the mansion, the mistress of the house has passed away. The player is talking to the housekeeper in this scenario. 
Bear in mind that the player may be a bit vague about what they want to talk about, because of this, try detecting a topic that is close to or approximates the ones in the JSON object I will give you. 

If the topic is similar to the ones found in the JSON object, please return an appropriate sentence.
For example, in the player says: "So, how's your work going?", return: {"chitchat" : "work[1]"}.
For example, in a sentence such as: "Are you happy working here?", return {"chitchat": "lifephilosophy[1]"}.

In case there is no approximate match, return the topic that you have detected in the sentence.
For example, in a sentence such as: "What do you think about cars?", return {"chitchat": "cars"}.

This is the JSON object containing chitchat topics: ${JSON.stringify(NPC1.chitchat)}.

PLEASE, ONLY REPLY WITH THE JSON OBJECT. DON'T USE QUOTES IN YOUR ANSWER. This is the text:
`

const classifyGoal = `
This is a JSON object: {"goal": <goal>}. Please, detect what the player may want to talk about in the text that I will give you. The JSON object I will give you below will help you recognize if the user is talking about either (1) entering the basement or (2) discovering some pictures.
In this video game setting the user plays as the daughter of the sir of the mansion, the mistress of the house has passed away. The player is talking to the housekeeper in this scenario. 
What is important in the text you will receive is that you also detect if the player is referring to something that seems like a proper name.

If you detect the user is talking about either entering the basement or about the pictures, please return an appropriate sentence.
For example, if the player talks about the basement: "Um, I would like to know what's up with the basement", return: {"goal" : "basement[2]"}.
For example, if the player talks about the pictures: "In your room there are some weird pictures, what is that?", return: {"goal" : "pictures[1]"}.

Importantly, in the case that you also detect the player is trying to tell something like a proper name or starts spelling a name, please put said name or spelling in the JSON object.
For example, if you detect something that seems like a name: "I found pictures of a guy called Jack N dorn in your room", return {"goal" : "Jack N dorn"}.
For example, if you detect spelling in capital letters: "You spell it as EGONNEMEV", return {"goal" : "EGONNEMEV"}.
For example, if you detect both: "The name is Egon Nemeith, EGONNEMEV", return {"goal" : "Egon Nemeith, EGONNEMEV"}.

This is the JSON object containing chitchat topics: ${JSON.stringify(NPC1.goal)}.

PLEASE, ONLY REPLY WITH THE JSON OBJECT. DON'T USE QUOTES IN YOUR ANSWER. This is the text:
`




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
    other: " ",
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

    /* Auxiliary TIMEOUT and Unknown Topic responses, working with a History state. */
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

        UnknownOther: {
          entry: {
            type: "say",
            params: ({context})=> `Excuse me, but I do not know what ${context.other} you are referring to`
          },
          on: { SPEAK_COMPLETE: "#DM.main.hist" }
        },
        
        UnknownTopic: {
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

        /* Main States */

        Greeting: {
          entry: {
            type: "say",
            params: `Miss, what are you doing up so late?`,
          },
          on:
            { SPEAK_COMPLETE: "IntentionCheck"} //State1 to go to grounding module
        },

        /* Detecting intention */

        IntentionCheck: {
          entry: {
            type: "listen",
          },
          on: {
            RECOGNISED: [
              {
                target: "GPTintent",
                actions: assign({
                  lastResult: ({ event }) => event.value[0].utterance
                })
              },
            ],
            ASR_NOINPUT: "CantHear",
          }
        },

        GPTintent: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              const data = await fetchFromChatGPT(classifyIntent + input.lastResult, 1000);
              return data;
            }),
            input: ({ context }) => ({
              lastResult: context.lastResult, // To pass object with utterance and CS, remove ".utterance"
            }),
            onDone: [
              {
                guard: ({ event }) => JSON.parse(event.output).intent === "information",
                target: "GPTinformation",
              },
              {
                guard: ({ event }) => JSON.parse(event.output).intent === "chitchat",
                target: "GPTchitchat",
              },
              {
                guard: ({ event }) => JSON.parse(event.output).intent === "goal",
                target: "GPTgoal",
              },
              {
                guard: ({ event }) => JSON.parse(event.output).intent === "other",
                target: "GPTother",
              },
              {
                guard: ({ event }) => JSON.stringify(event.output).includes("information."),
                target: "SpeakGPTinformation",
                actions: assign({
                  gptoutput: ({ event }) => "NPC1." + JSON.parse(event.output).intent
                })
              },
              {
                guard: ({ event }) => JSON.stringify(event.output).includes("chitchat."),
                target: "SpeakGPTchitchat",
                actions: assign({
                  gptoutput: ({ event }) => "NPC1." + JSON.parse(event.output).intent
                })
              },
              {
                guard: ({ event }) => JSON.stringify(event.output).includes("goal."),
                target: "SpeakGPTgoal",
                actions: assign({
                  gptoutput: ({ event }) => "NPC1." + JSON.parse(event.output).intent
                })
              },
              {
                guard: ({ event }) => JSON.stringify(event.output).includes("other."),
                target: "SpeakGPTother",
                actions: assign({
                  gptoutput: ({ event }) => "NPC1." + JSON.parse(event.output).intent
                })
              },
              {
                guard: ({ event }) => JSON.parse(event.output).intent === "name",
                target: "State1",
                actions: assign({
                  namesentence: ({ context }) => context.lastResult
                })
              },

            ],
          },
        },

        GPTinformation: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              const data = await fetchFromChatGPT(classifyInfo + input.lastResult, 1000);
              return data;
            }),
            input: ({ context }) => ({
              lastResult: context.lastResult,  // To pass object with Utterance and CS, remove ".utterance"
            }),
            onDone: [
              {
                //guard: ({ event }) => JSON.parse(event.output).intent.includes("information"),
                target: "SpeakGPTinformation",
              },
            ],
          },
        },

        GPTchitchat: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              const data = await fetchFromChatGPT(classifyInfo + input.lastResult, 1000);
              return data;
            }),
            input: ({ context }) => ({
              lastResult: context.lastResult,  // To pass object with Utterance and CS, remove ".utterance"
            }),
            onDone: [
              {
                //guard: ({ event }) => JSON.parse(event.output).intent.includes("information"),
                target: "SpeakGPTchitchat",
              },
            ],
          },
        },

        GPTgoal: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              const data = await fetchFromChatGPT(classifyInfo + input.lastResult, 1000);
              return data;
            }),
            input: ({ context }) => ({
              lastResult: context.lastResult,  // To pass object with Utterance and CS, remove ".utterance"
            }),
            onDone: [
              {
                //guard: ({ event }) => JSON.parse(event.output).intent.includes("information"),
                target: "SpeakGPTgoal",
              },
            ],
          },
        },
    
        GPTother: {
          invoke: {
            src: fromPromise(async ({ input }) => {
              const data = await fetchFromChatGPT(classifyInfo + input.lastResult, 1000);
              return data;
            }),
            input: ({ context }) => ({
              lastResult: context.lastResult, // To pass object with Utterance and CS, remove ".utterance"
            }),
            onDone: [
              {
                //guard: ({ event }) => JSON.parse(event.output).intent.includes("information"),
                target: "SpeakGPTother",
              },
            ],
          },
        },

        SpeakGPTinformation :{
          entry: {
            type: "say",
            params: ({ context }) => `${eval(context.gptoutput)}`
          },
          on: { SPEAK_COMPLETE: "Done" }
        },

        SpeakGPTchitchat :{
          entry: {
            type: "say",
            params: ({ context }) => `${eval(context.gptoutput)}`
          },
          on: { SPEAK_COMPLETE: "Done" }
        },

        SpeakGPTgoal :{
          entry: {
            type: "say",
            params: ({ context }) => `${eval(context.gptoutput)}`
          },
          on: { SPEAK_COMPLETE: "Done" }
        },

        SpeakGPTother :{
          entry: {
            type: "say",
            params: ({ context }) => `${eval(context.gptoutput)}`
          },
          on: { SPEAK_COMPLETE: "Done" }
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

        /* After grounding and agreeing on not understanding the name, we wait for the speaker (user) to cancel. */

        UnknownPerson: {
          entry: {
            type: "say",
            params: `My apologies, but I do not know who you talk about Young Miss`//${randomRepeat(feedback["clarification-request"]["general-request"])}`
          },
          on: { SPEAK_COMPLETE: "State1" }
        },


        /* The speaker utters a Name and the listener detects it, triggering grounding mode for the Name in question.
        Susequent user interactions are not allowed in this implementation, if the speaker (user) elicits an acknowledgment 
        after a name, and the name is correct, the listener (machine) will interpret the name. 
        This means that the state S to 1 (name) doesn't get the intermediate state 3 (acknowledgment by speaker) and then 
        goes to F, but it goes directly to Ex: John Smith... yeah.
        */

        /* STATE 1
         Base version: Extremely naive Name + Surname detection, look at object reProperName (regex).
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
              That is represented by confirming that the name matches with the randomName generated */

              {
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) === randomName && utteranceMatch(feedback["clarification-request"]["spelling-offer"], event.value[0].utterance) && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD" || checkScore(event.value[0].confidence) === "OK" ),
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
    
              Unlikely scenario if the environmental conditions are good. */

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
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reProperName.exec(event.value[0].utterance)[0].substring(1) !== randomName && utteranceMatch(feedback["clarification-request"]["spelling-offer"], event.value[0].utterance),
                actions: assign({
                  spellreaction: "Okay",
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1),
                }),
                target: "State4",
              },

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
              Here an acknowledgment is expected in State 2.
              This should be State 3 instead, but we have set acknowledgments when in State 3 */

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
                    //change name to "repeat-request" if time permits, otherwise, paraphrase is synonym for reaction.
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
                guard: ({ event }) => reProperName.exec(event.value[0].utterance) && reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  propername: ({ event }) => reProperName.exec(event.value[0].utterance)[0].substring(1)
                }),
                target: "State7"
              },

              /* TO STATE 7
              Only detecting spelling. */

              {
                guard: ({ event }) => reSpell.exec(event.value[0].utterance),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                }),
                target: "State7"
              },

              // perception level error
              {
                target: "#DM.aux.UnknownTopic",

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

        // FeedbackState1: {
        //   // We need this state because we cannot do listen + listen, and then we need conditions in State 1 regarding previous 
        //   // misunderstood name: S1 "Etel Zimmer?"-> S2 No it's actually "Aethel Zimmer"-> condition for checking propername detected here
        //   entry: {
        //     type: "say",
        //     params: ({ context }) => `hmm...`
        //   },
        //   on:
        //     { SPEAK_COMPLETE: "State1" },
        // },

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

        /* TO STATES 2, 3 & 5

        Recursion to State 1 not handled here, instead listening in State 2, preserving the logic explained in
        Bondarenko (2019, p.23).
    
        A correction of the name is expected, whether it matches or not is checked in State3.
        
        Not in this basic version: 
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
                guard: ({ event }) => reSpell.exec(event.value[0].utterance),
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
        The agent is going to repeat the spelling that it has heard or acknowledge it depending on Confidence Score, it won't paraphrase it. 
    
        We give the opportunity first to the speaker to continue spelling, if not, the machine continues
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

              /* TO STATE : "I don't know WHO you are talking about"
              Name doesn't match, but the confidence is very good. Grounded but incorrect. ✦ Logic for this: if the agent is sure about the spelling, they can recognize they don't know the person. ✦ */

              {
                guard: ({ event, context }) => spellingMatch(reSpell.exec(event.value[0].utterance), randomName) !== randomName && (checkScore(event.value[0].confidence) === "VERYGOOD" || checkScore(event.value[0].confidence) === "GOOD" || checkScore(event.value[0].confidence) === "OK"),
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  //reaction: randomRepeat(feedback["clarification-request"]["repeat-request"]),
                }),
                target: "UnknownPerson"
              },

              /* Name does not match and the confidence is low, an opportunity to repair is given in State 8. */

              {
                guard: ({ event, context }) => spellingMatch(reSpell.exec(event.value[0].utterance), randomName) !== randomName && checkScore(event.value[0].confidence) === "LOW",
                actions: assign({
                  spelling: ({ event }) => reSpell.exec(event.value[0].utterance),
                  reaction: ({ event }) => reSpell.exec(event.value[0].utterance) + "?",
                }),
                target: "State8"
              },

              /* Name detected, no spelling, uttered as confirmation. */

              {
                // If a proper name is detected, but not spelling, to State 5 to ask for spelling
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

              /* TO GROUNDED STATE
              First it should be checked whether the spelling matches or not from previous state.  */

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

              /* Negation detected */

              {
                guard: ({ event }) => event.value[0].utterance.toLowerCase().includes("no"),
                target: "UnknownPerson",
              },

              {
                target: "#DM.aux.UnknownTopic"
              }

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

              /* If name still doesn't match after timeout, spelling request is made in State5. 
              An assumtion that the user grows tired of repeating is made here. */

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
            params: ({ context }) => `${context.propername}, huh? <emphasis level='strong'> My, my. Quite the nosy child are you... </emphasis> You want to enter the basement? Go ahead, brat.`
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
    dmActor.send({ type: "CLICK" }); 
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

