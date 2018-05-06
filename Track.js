const FSM = require('./Context')
const {TmAlias} = require('./Alias')
const TmLibrary = require('./Library')

const ArgumentPatterns = {
  uns: {
    patt: '(\\d+(?:\\.\\d+)?)',
    meta: 'Expression'
  },
  sig: {
    patt: '([+\\-]\\d+(?:\\.\\d+)?)',
    meta: 'Expression'
  },
  int: {
    patt: '([+\\-]?\\d+(?:\\.\\d+)?)',
    meta: 'Expression'
  },
  exp: {
    patt: '([+\\-]?\\d+(?:[./]\\d+)?|Log2\\(\\d+\\)(?:[+\\-]\\d+)?)',
    meta: 'Expression'
  },
  str: {
    patt: '((?:[^\\{\\}\\(\\)\\[\\]\\"\\,]|\\\\.)*)',
    meta: 'String'
  },
  nam: {
    patt: '([a-zA-Z][a-zA-Z\\d]*)',
    meta: 'String'
  },
  mac: {
    patt: '(@[a-zA-Z]\\w*)',
    meta: 'Macrotrack'
  }
}

class NoteSyntax {
  constructor(chords, degrees) {
    const degree = NoteSyntax.ArrayToRegex(degrees, false)
    const chord = NoteSyntax.ArrayToRegex(chords, true)
    const pitOp = "[#b',]*"
    const durOp = '[._=-]*'
    const volOp = '[>:]*'
    const epilog = '[`]*'
    const inner = `(?:${pitOp}${chord}${volOp})`
    const outer = `(?:${durOp}${epilog})`
    this.deg = `(${degree})`
    this.in = `(${pitOp})(${chord})(${volOp})`
    this.out = `(${durOp})(${epilog})`
    this.sqr = `\\[((?:${degree}${inner})+)\\]`
    this.pit = `(${degree}${pitOp}${chord}${volOp})`
    this.Patt = `(?:(?:\\[(?:${degree}${inner})+\\]|${degree})${inner}${outer})`
  }

  static ArrayToRegex(array, multi = true) {
    let charset = '', quantifier = ''
    if (array.length > 0) {
      if (multi) quantifier = '*'
      charset = '[' + array.join('') + ']'
    }
    return charset + quantifier
  }
}

class TrackSyntax {
  constructor(syntax, degrees = []) {
    const name = syntax.Dict.map(func => func.Name).join('|')
    const chords = syntax.Chord.map(chord => chord.Notation)
    const note = new NoteSyntax(chords, degrees)
    const dict = Object.assign({
      not: {
        patt: '(' + note.Patt + '+)',
        meta: 'Subtrack',
        epilog: arg => this.tokenize(arg, 'note').Content
      }
    }, ArgumentPatterns)

    // Non-alias Functions
    this.nonalias = [
      {
        patt: new RegExp(`^(${name})\\(`),
        push: 'argument',
        token(match, content) {
          return {
            Type: 'Function',
            Name: match[1],
            Alias: -1,
            Args: content,
            VoidQ: syntax.Dict.find(func => func.Name === match[1]).VoidQ
          }
        }
      },
      {
        patt: new RegExp(`^\\((${name}):`),
        push: 'argument',
        token(match, content) {
          return {
            Type: 'Function',
            Name: match[1],
            Alias: 0,
            Args: content,
            VoidQ: syntax.Dict.find(func => func.Name === match[1]).VoidQ
          }
        }
      }
    ]

    // Subtrack & Macrotrack & PlainFunction
    this.proto = [
      {
        patt: /^\{(?:(\d+)\*)?/,
        push: 'default',
        token(match, content) {
          let repeat
          if (match[1] !== undefined) {
            repeat = parseInt(match[1])
          } else {
            const volta = content.filter(tok => tok.Type === 'BarLine' && tok.Order[0] > 0)
            repeat = Math.max(-1, ...volta.map(tok => Math.max(...tok.Order)))
          }
          return {
            Type: 'Subtrack',
            Repeat: repeat,
            Content: content
          }
        }
      },
      {
        patt: /^@([a-zA-Z]\w*)/,
        token(match) {
          return {
            Type: 'Macrotrack',
            Name: match[1]
          }
        }
      },
      FSM.include('nonalias')
    ];

    this.note = degrees.length === 0 ? [] : [
      {
        patt: new RegExp('^' + note.deg + note.in + note.out),
        token(match) {
          return {
            Type: 'Note',
            Pitches: [
              {
                Degree: match[1],
                PitOp: match[2],
                Chord: match[3],
                VolOp: match[4]
              }
            ],
            PitOp: '',
            Chord: '',
            VolOp: '',
            DurOp: match[5],
            Stac: match[6].length
          }
        }
      },
      {
        patt: new RegExp('^' + note.sqr + note.in + note.out),
        token(match) {
          const inner = new RegExp(note.deg + note.in)
          const match1 = match[1].match(new RegExp(inner, 'g'))
          return {
            Type: 'Note',
            Pitches: match1.map(str => {
              const match = inner.exec(str)
              return {
                Degree: match[1],
                PitOp: match[2],
                Chord: match[3],
                VolOp: match[4]
              }
            }),
            PitOp: match[2],
            Chord: match[3],
            VolOp: match[4],
            DurOp: match[5],
            Stac: match[6].length
          }
        }
      }
    ];

    this.meta = [
      {
        patt: /^>/,
        pop: true
      },
      {
        patt: /^(\s*)([a-zA-Z][a-zA-Z\d]*)/,
        push: [
          {
            patt: /^(?=>)/,
            pop: true
          },
          {
            patt: /^,/,
            pop: true
          },
          FSM.include('alias'),
          FSM.include('nonalias'),
          FSM.item('Macropitch', /^\[([a-zA-Z])\]/),
          {
            patt: /^\[([a-zA-Z])=/,
            push: [
              {
                patt: /^\]/,
                pop: true
              },
              {
                patt: new RegExp('^' + note.pit),
                token(match) {
                  return {
                    Degree: match[1],
                    PitOp: match[2],
                    Chord: match[3],
                    VolOp: match[4]
                  }
                }
              }
            ],
            token(match, content) {
              return {
                Type: 'Macropitch',
                Content: match[1],
                Pitches: content
              }
            }
          },
          FSM.item('Space', /^(\s+)/)
        ],
        token(match, content) {
          console.log(content)
          return {
            Type: '@inst',
            name: match[2],
            spec: content.filter(tok => tok.Type !== 'Macropitch'),
            dict: content.filter(tok => tok.Type === 'Macropitch'),
            space: match[1]
          }
        }
      }
    ];

    // Section Notations
    this.section = [
      FSM.item('LocalIndicator', /^!/)
    ];

    this.volta = [
      {
        patt: /^(\d+)~(\d+)/,
        token(match) {
          const result = []
          for (let i = parseInt(match[1]); i <= parseInt(match[2]); i++) {
            result.push(i)
          }
          return result
        }
      },
      {
        patt: /^\d+/,
        token: match => parseInt(match[0])
      },
      {
        patt: /^[.,] */
      }
    ];

    // Track Contents
    this.default = [
      FSM.include('alias'),
      FSM.include('proto'),
      FSM.include('note'),
      FSM.include('section'),
      {
        patt: /^\}/,
        pop: true
      },
      {
        patt: /^\\(?=(\d+(~\d+)?(, *\d+(~\d+)?)*)?:)/,
        push: FSM.next('volta', /^:/),
        token(match, content) {
          return {
            Type: 'BarLine',
            Skip: false,
            Overlay: false,
            Order: [].concat(...content)
          }
        },
        locate: false
      },
      {
        patt: /^(\/|\||\\)/,
        token(match) {
          return {
            Type: 'BarLine',
            Skip: match[0] === '\\',
            Overlay: match[0] === '/',
            Order: [0]
          }
        }
      },
      {
        patt: /^<\*/,
        push: [
          {
            patt: /^\*>/,
            pop: true
          },
          FSM.item('@literal', /^(.)/)
        ],
        token(match, content) {
          return {
            Type: 'Comment',
            Content: content.map(tok => tok.Content).join('')
          }
        }
      },
      FSM.item('Tie', /^\^/),
      FSM.item('Space', /^(\s+)/)
    ];

    this.argument = [
      {
        patt: /^\)/,
        pop: true
      },
      {
        patt: /^, */
      },
      {
        patt: /^\[/,
        push: FSM.next('argument', /^\]/),
        token(match, content) {
          return {
            Type: 'Array',
            Content: content
          }
        }
      },
      {
        patt: /^"(([^\{\}\(\)\[\]\"\,]|\\.)*)"/,
        token(match) {
          return {
            Type: 'String',
            Content: match[1].replace(/\\(?=.)/, '')
          }
        }
      },
      FSM.item('Expression', /^([+\-]?\d+([./]\d+)?|Log2\(\d+\)([+\-]\d+)?)/),
      FSM.include('proto')
    ]
    this.alias = syntax.Alias.map(alias => new TmAlias(alias).build(dict))
    TmLibrary.loadContext(this, syntax.Context)
  }

  tokenize(string, state, epi = true) {
    return new FSM(this).tokenize(string, state, epi);
  }
}

module.exports = TrackSyntax
