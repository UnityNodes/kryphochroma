export const kryphoTableAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "takeover",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyDrew",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadySeated",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadAction",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadCard",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadColor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadConfig",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadSession",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadSlot",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotCatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotDraw",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotPass",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotSayMono",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CatchTooEarly",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DrawFourPending",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DrawPending",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "IllegalCard",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidKMSSignatures",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MustPlayDrawnCard",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MustStackOrTake",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoDrawFour",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoPendingDraw",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotCreator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotDealt",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotYourTurn",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RevealNotReady",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ShuffleNotDone",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "StaleHand",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TableFull",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TurnNotExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "enum IKryphoTable.Stage",
        "name": "expected",
        "type": "uint8"
      },
      {
        "internalType": "enum IKryphoTable.Stage",
        "name": "actual",
        "type": "uint8"
      }
    ],
    "name": "WrongStage",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZamaProtocolUnsupported",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "nonce",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "bytes4",
        "name": "reason",
        "type": "bytes4"
      }
    ],
    "name": "ActionRejected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "nonce",
        "type": "uint32"
      }
    ],
    "name": "ActionRelayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "hadColor",
        "type": "bool"
      }
    ],
    "name": "ChallengeResolved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "round",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "firstSeat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "topCard",
        "type": "uint8"
      }
    ],
    "name": "Dealt",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "DrawFourAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "DrawFourChallenged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "count",
        "type": "uint8"
      }
    ],
    "name": "DrawsTaken",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "slot",
        "type": "uint8"
      }
    ],
    "name": "Drew",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "session",
        "type": "address"
      }
    ],
    "name": "Joined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int8",
        "name": "winner",
        "type": "int8"
      }
    ],
    "name": "MatchOver",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "MonoCaught",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "MonoSaid",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "Passed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "slot",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "card",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "color",
        "type": "uint8"
      }
    ],
    "name": "Played",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32[]",
        "name": "handlesList",
        "type": "bytes32[]"
      },
      {
        "indexed": false,
        "internalType": "bytes",
        "name": "abiEncodedCleartexts",
        "type": "bytes"
      }
    ],
    "name": "PublicDecryptionVerified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "count",
        "type": "uint8"
      }
    ],
    "name": "Reshuffled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "candidate",
        "type": "uint8"
      }
    ],
    "name": "RevealStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int8",
        "name": "winner",
        "type": "int8"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "points",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "cheaters",
        "type": "uint8"
      }
    ],
    "name": "RoundSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "SeatAbandoned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "step",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "total",
        "type": "uint16"
      }
    ],
    "name": "ShuffleProgress",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "TableCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "uint8",
            "name": "seats",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "turnTimeout",
            "type": "uint32"
          },
          {
            "internalType": "uint16",
            "name": "targetScore",
            "type": "uint16"
          },
          {
            "internalType": "bool",
            "name": "singleRound",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "stackDrawTwo",
            "type": "bool"
          }
        ],
        "indexed": false,
        "internalType": "struct IKryphoTable.Config",
        "name": "config",
        "type": "tuple"
      }
    ],
    "name": "TableCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "TimedOut",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TAKEOVER",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "acceptDrawFour",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "cancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "target",
        "type": "uint8"
      }
    ],
    "name": "catchMono",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "challengeDrawFour",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "confidentialProtocolId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint8",
            "name": "seats",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "turnTimeout",
            "type": "uint32"
          },
          {
            "internalType": "uint16",
            "name": "targetScore",
            "type": "uint16"
          },
          {
            "internalType": "bool",
            "name": "singleRound",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "stackDrawTwo",
            "type": "bool"
          }
        ],
        "internalType": "struct IKryphoTable.Config",
        "name": "config",
        "type": "tuple"
      }
    ],
    "name": "createTable",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "dealSeat",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "index",
        "type": "uint8"
      }
    ],
    "name": "deckCardAt",
    "outputs": [
      {
        "internalType": "euint8",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "discardOf",
    "outputs": [
      {
        "internalType": "uint8[]",
        "name": "cards",
        "type": "uint8[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "draw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "cleartexts",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "finishReveal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "forceTimeout",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "getSeat",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "session",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "handSize",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "slots",
            "type": "uint32"
          },
          {
            "internalType": "bool",
            "name": "saidMono",
            "type": "bool"
          },
          {
            "internalType": "uint8",
            "name": "timeouts",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "abandoned",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "score",
            "type": "uint16"
          }
        ],
        "internalType": "struct KryphoTable.Seat",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getTable",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "creator",
            "type": "address"
          },
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "seats",
                "type": "uint8"
              },
              {
                "internalType": "uint32",
                "name": "turnTimeout",
                "type": "uint32"
              },
              {
                "internalType": "uint16",
                "name": "targetScore",
                "type": "uint16"
              },
              {
                "internalType": "bool",
                "name": "singleRound",
                "type": "bool"
              },
              {
                "internalType": "bool",
                "name": "stackDrawTwo",
                "type": "bool"
              }
            ],
            "internalType": "struct IKryphoTable.Config",
            "name": "config",
            "type": "tuple"
          },
          {
            "internalType": "enum IKryphoTable.Stage",
            "name": "stage",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "joined",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "turn",
            "type": "uint8"
          },
          {
            "internalType": "int8",
            "name": "dir",
            "type": "int8"
          },
          {
            "internalType": "uint8",
            "name": "topCard",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "color",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "turnDeadline",
            "type": "uint64"
          },
          {
            "internalType": "uint16",
            "name": "round",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "setupStep",
            "type": "uint16"
          },
          {
            "internalType": "uint8",
            "name": "dealtMask",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "deckPtr",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "deckEnd",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "refillAt",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "refillSize",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "refillStep",
            "type": "uint8"
          },
          {
            "internalType": "uint16",
            "name": "refillFrom",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "discardBase",
            "type": "uint16"
          },
          {
            "internalType": "uint8",
            "name": "drawnSlot",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "pendingDraw",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "monoWindow",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "drawFourBy",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "prevColor",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "candidate",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "revealPrepared",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "monoBlock",
            "type": "uint64"
          }
        ],
        "internalType": "struct KryphoTable.Table",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "hadColorOf",
    "outputs": [
      {
        "internalType": "ebool",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "handOf",
    "outputs": [
      {
        "internalType": "euint8[24]",
        "name": "",
        "type": "bytes32[24]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "session",
        "type": "address"
      }
    ],
    "name": "join",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "nextRound",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "noncesOf",
    "outputs": [
      {
        "internalType": "uint32[4]",
        "name": "",
        "type": "uint32[4]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "pass",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "slot",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "card",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "chosenColor",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "seenHandle",
        "type": "bytes32"
      }
    ],
    "name": "play",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "prepareReveal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "uint8",
            "name": "seat",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "kind",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "slot",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "card",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "color",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "seenHandle",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "nonce",
            "type": "uint32"
          },
          {
            "internalType": "uint8",
            "name": "v",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "r",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "s",
            "type": "bytes32"
          }
        ],
        "internalType": "struct KryphoTable.Action[]",
        "name": "actions",
        "type": "tuple[]"
      }
    ],
    "name": "relay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "uint8",
            "name": "seat",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "kind",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "slot",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "card",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "color",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "seenHandle",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "nonce",
            "type": "uint32"
          },
          {
            "internalType": "uint8",
            "name": "v",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "r",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "s",
            "type": "bytes32"
          }
        ],
        "internalType": "struct KryphoTable.Action",
        "name": "a",
        "type": "tuple"
      }
    ],
    "name": "relayOne",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "reshuffleStep",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "cleartexts",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "resolveChallenge",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "revealHandles",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "seat",
        "type": "uint8"
      }
    ],
    "name": "sayMono",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "cleartexts",
        "type": "bytes"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "setStarter",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "setupStep",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "start",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "starterHandles",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tableCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "takeDraws",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
