class NoteSyntax {
  constructor(chords, degrees) {
    this.Degrees = degrees
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

  pattern() {
    return this.Patt
  }

  pitch() {
    return this.deg + this.in
  }

  context() {
    const deg = this.deg
    const _in = this.in
    const out = this.out
    const sqr = this.sqr
    return this.Degrees.length === 0 ? [] : [
      {
        patt: new RegExp('^' + deg + _in + out),
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
        patt: new RegExp('^' + sqr + _in + out),
        token(match) {
          const inner = new RegExp(deg + _in)
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
    ]
  }
}

module.exports = NoteSyntax
