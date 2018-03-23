class TIFF
  @tags:
    ImageWidth:                0x100
    ImageLength:               0x101
    BitsPerSample:             0x102
    Compression:               0x103
    PhotometricInterpretation: 0x106
    StripOffsets:              0x111
    RowsPerStrip:              0x116
    StripByteCounts:           0x117
    ExtraSamples:              0x152
    SampleFormat:              0x153
    ICCProfile:                0x8773

  @types:
    BYTE: 1
    ASCII: 2
    SHORT: 3
    LONG: 4
    RATIONAL: 5
    SBYTE: 6
    UNDEFINED: 7
    SSHORT: 8
    SLONG: 9
    SRATIONAL: 10
    FLOAT: 11
    DOUBLE: 12

  @sampleFormats:
    UNSIGNED_INT: 1
    SIGNED_INT: 2
    FLOAT: 3
    UNDEFINED: 4

  constructor: ->
    @error = null

  fail: (reason, returnValue = false) ->
    if @error
      @error += " / "
    else
      @error = ""

    @error += reason
    return returnValue

  readU16: (offset, buffer = @raw) ->
    if @bigEndian
      return buffer.readUInt16BE(offset)
    return buffer.readUInt16LE(offset)

  readU32: (offset, buffer = @raw) ->
    if @bigEndian
      return buffer.readUInt32BE(offset)
    return buffer.readUInt32LE(offset)

  decode: (raw) ->
    @raw = Buffer.from(raw)

    byteOrder = @raw.readUInt16LE(0)
    if byteOrder == 0x4949
      @bigEndian = false
    else if byteOrder == 0x4d4d
      @bigEndian = true
    else
      return @fail("invalid byte order (bytes 0-1)")

    mustBe42 = @readU16(2)
    if mustBe42 != 42
      return @fail("magic value 42 not found (bytes 2-3)")

    firstIFDOffset = @readU32(4)
    @ifd = @readIFD(firstIFDOffset)
    if @ifd == null
      return false

    @profile = @readBytes('ICCProfile')
    return null if @error

    @width = @readNumber('ImageWidth')
    return null if @error
    if not @width
      return false

    @height = @readNumber('ImageLength')
    return null if @error
    if not @height
      return false

    # photometricInterpretation = @readNumber('PhotometricInterpretation')
    # if photometricInterpretation != 1
    #   return @fail("PhotometricInterpretation claims that black isn't 0, unsupported (#{photometricInterpretation})")

    @compression = @readNumber('Compression')
    return null if @error
    if @compression != 1 # no compression
      return @fail("cannot read compression type #{@compression}")

    @bits = @readNumbers('BitsPerSample')
    return null if @error
    if not @bits
      return false
    for bit in @bits
      if bit != 16
        return @fail("only 16bit values are supported")

    @extraSamples = @readNumbers('ExtraSamples')
    return null if @error
    if not @extraSamples
      @extraSamples = []

    @channelCount = @bits.length + @extraSamples.length

    @sampleFormat = @readNumbers('SampleFormat')
    return null if @error
    if @sampleFormat == null
      # TODO: assume [1,1,1]?
      return @fail("cannot read SampleFormat")

    @rowsPerStrip = @readNumbers('RowsPerStrip')
    return null if @error
    if @rowsPerStrip == null
      return @fail("cannot read RowsPerStrip")

    @stripOffsets = @readNumbers('StripOffsets')
    return null if @error
    if @stripOffsets == null
      return @fail("cannot read StripOffsets")

    @stripByteCounts = @readNumbers('StripByteCounts')
    return null if @error
    if @stripByteCounts == null
      return @fail("cannot read StripByteCounts")

    if @stripOffsets.length != @stripByteCounts.length
      return @fail("StripOffsets count differs from StripByteCounts count")

    @pixels = Buffer.alloc(2 * @width * @height * @channelCount)
    pixelOffset = 0
    for stripOffsetIndex in [0...@stripOffsets.length]
      byteOffset = @stripOffsets[stripOffsetIndex]
      byteCount = @stripByteCounts[stripOffsetIndex]
      @raw.copy(@pixels, pixelOffset, byteOffset, byteOffset + byteCount)
      pixelOffset += byteOffset

    return true

  readIFD: (offset) ->
    ifd = {}
    ifd.count = @readU16(offset)
    ifd.entries = {}
    for i in [0...ifd.count]
      entryOffset = offset + 2 + (i * 12)
      entry = {}
      entry.tag = @readU16(entryOffset+0)
      entry.type = @readU16(entryOffset+2)
      entry.count = @readU32(entryOffset+4)
      entry.offset = @readU32(entryOffset+8)
      entry.rawValue = @raw.slice(entryOffset+8, entryOffset+8+4)
      ifd.entries[entry.tag] = entry
    return ifd

  readNumber: (tagName) ->
    if not TIFF.tags[tagName]
      return @fail("readNumber: no tag named '#{tagName}'", null)

    entry = @ifd.entries[TIFF.tags[tagName]]
    if not entry
      return null

    if entry.count != 1
      @fail("readNumber: expecting a single value (count = #{entry.count})")
      return null

    # console.log "reading #{tagName}"

    switch entry.type
      when TIFF.types.SHORT
        return @readU16(0, entry.rawValue)
      when TIFF.types.LONG
        return @readU32(0, entry.rawValue)

    @fail("readNumber: can't interpret entry type of #{entry.type}")
    return null

  readNumbers: (tagName) ->
    if not TIFF.tags[tagName]
      return @fail("readNumbers: no tag named '#{tagName}'", null)

    entry = @ifd.entries[TIFF.tags[tagName]]
    if not entry
      return null

    if entry.count == 1
      number = @readNumber(tagName)
      if number != null
        return [number]

    numbers = []
    for i in [0...entry.count]
      switch entry.type
        when TIFF.types.SHORT
          numbers.push @readU16(entry.offset + (i * 2))
        when TIFF.types.LONG
          numbers.push @readU32(entry.offset + (i * 4))
        else
          @fail("readNumbers: can't interpret entry type of #{entry.type}")
          return null

    return numbers

  readBytes: (tagName) ->
    if not TIFF.tags[tagName]
      return @fail("readBytes: no tag named '#{tagName}'", null)

    entry = @ifd.entries[TIFF.tags[tagName]]
    if not entry
      return null

    switch entry.type
      when TIFF.types.UNDEFINED
        return @raw.slice(entry.offset, entry.offset + entry.count)

    @fail("readBytes: can't interpret entry type of #{entry.type}")
    return null

module.exports = TIFF
