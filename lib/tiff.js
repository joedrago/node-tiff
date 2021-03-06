// Generated by CoffeeScript 2.2.3
(function() {
  var TIFF;

  TIFF = (function() {
    class TIFF {
      constructor() {
        this.error = null;
      }

      fail(reason, returnValue = false) {
        if (this.error) {
          this.error += " / ";
        } else {
          this.error = "";
        }
        this.error += reason;
        return returnValue;
      }

      readU16(offset, buffer = this.raw) {
        if (this.bigEndian) {
          return buffer.readUInt16BE(offset);
        }
        return buffer.readUInt16LE(offset);
      }

      readU32(offset, buffer = this.raw) {
        if (this.bigEndian) {
          return buffer.readUInt32BE(offset);
        }
        return buffer.readUInt32LE(offset);
      }

      decode(raw) {
        var bit, byteCount, byteOffset, byteOrder, firstIFDOffset, j, k, len, mustBe42, pixelOffset, ref, ref1, stripOffsetIndex;
        this.raw = Buffer.from(raw);
        byteOrder = this.raw.readUInt16LE(0);
        if (byteOrder === 0x4949) {
          this.bigEndian = false;
        } else if (byteOrder === 0x4d4d) {
          this.bigEndian = true;
        } else {
          return this.fail("invalid byte order (bytes 0-1)");
        }
        mustBe42 = this.readU16(2);
        if (mustBe42 !== 42) {
          return this.fail("magic value 42 not found (bytes 2-3)");
        }
        firstIFDOffset = this.readU32(4);
        this.ifd = this.readIFD(firstIFDOffset);
        if (this.ifd === null) {
          return false;
        }
        this.profile = this.readBytes('ICCProfile');
        if (this.error) {
          return null;
        }
        this.width = this.readNumber('ImageWidth');
        if (this.error) {
          return null;
        }
        if (!this.width) {
          return false;
        }
        this.height = this.readNumber('ImageLength');
        if (this.error) {
          return null;
        }
        if (!this.height) {
          return false;
        }
        // photometricInterpretation = @readNumber('PhotometricInterpretation')
        // if photometricInterpretation != 1
        //   return @fail("PhotometricInterpretation claims that black isn't 0, unsupported (#{photometricInterpretation})")
        this.compression = this.readNumber('Compression');
        if (this.error) {
          return null;
        }
        if (this.compression !== 1) { // no compression
          return this.fail(`cannot read compression type ${this.compression}`);
        }
        this.bits = this.readNumbers('BitsPerSample');
        if (this.error) {
          return null;
        }
        if (!this.bits) {
          return false;
        }
        ref = this.bits;
        for (j = 0, len = ref.length; j < len; j++) {
          bit = ref[j];
          if (bit !== 16) {
            return this.fail("only 16bit values are supported");
          }
        }
        this.extraSamples = this.readNumbers('ExtraSamples');
        if (this.error) {
          return null;
        }
        if (!this.extraSamples) {
          this.extraSamples = [];
        }
        this.channelCount = this.bits.length + this.extraSamples.length;
        this.sampleFormat = this.readNumbers('SampleFormat');
        if (this.error) {
          return null;
        }
        if (this.sampleFormat === null) {
          // TODO: assume [1,1,1]?
          return this.fail("cannot read SampleFormat");
        }
        this.rowsPerStrip = this.readNumbers('RowsPerStrip');
        if (this.error) {
          return null;
        }
        if (this.rowsPerStrip === null) {
          return this.fail("cannot read RowsPerStrip");
        }
        this.stripOffsets = this.readNumbers('StripOffsets');
        if (this.error) {
          return null;
        }
        if (this.stripOffsets === null) {
          return this.fail("cannot read StripOffsets");
        }
        this.stripByteCounts = this.readNumbers('StripByteCounts');
        if (this.error) {
          return null;
        }
        if (this.stripByteCounts === null) {
          return this.fail("cannot read StripByteCounts");
        }
        if (this.stripOffsets.length !== this.stripByteCounts.length) {
          return this.fail("StripOffsets count differs from StripByteCounts count");
        }
        this.pixels = Buffer.alloc(2 * this.width * this.height * this.channelCount);
        pixelOffset = 0;
        for (stripOffsetIndex = k = 0, ref1 = this.stripOffsets.length; (0 <= ref1 ? k < ref1 : k > ref1); stripOffsetIndex = 0 <= ref1 ? ++k : --k) {
          byteOffset = this.stripOffsets[stripOffsetIndex];
          byteCount = this.stripByteCounts[stripOffsetIndex];
          this.raw.copy(this.pixels, pixelOffset, byteOffset, byteOffset + byteCount);
          pixelOffset += byteOffset;
        }
        return true;
      }

      readIFD(offset) {
        var entry, entryOffset, i, ifd, j, ref;
        ifd = {};
        ifd.count = this.readU16(offset);
        ifd.entries = {};
        for (i = j = 0, ref = ifd.count; (0 <= ref ? j < ref : j > ref); i = 0 <= ref ? ++j : --j) {
          entryOffset = offset + 2 + (i * 12);
          entry = {};
          entry.tag = this.readU16(entryOffset + 0);
          entry.type = this.readU16(entryOffset + 2);
          entry.count = this.readU32(entryOffset + 4);
          entry.offset = this.readU32(entryOffset + 8);
          entry.rawValue = this.raw.slice(entryOffset + 8, entryOffset + 8 + 4);
          ifd.entries[entry.tag] = entry;
        }
        return ifd;
      }

      readNumber(tagName) {
        var entry;
        if (!TIFF.tags[tagName]) {
          return this.fail(`readNumber: no tag named '${tagName}'`, null);
        }
        entry = this.ifd.entries[TIFF.tags[tagName]];
        if (!entry) {
          return null;
        }
        if (entry.count !== 1) {
          this.fail(`readNumber: expecting a single value (count = ${entry.count})`);
          return null;
        }
        // console.log "reading #{tagName}"
        switch (entry.type) {
          case TIFF.types.SHORT:
            return this.readU16(0, entry.rawValue);
          case TIFF.types.LONG:
            return this.readU32(0, entry.rawValue);
        }
        this.fail(`readNumber: can't interpret entry type of ${entry.type}`);
        return null;
      }

      readNumbers(tagName) {
        var entry, i, j, number, numbers, ref;
        if (!TIFF.tags[tagName]) {
          return this.fail(`readNumbers: no tag named '${tagName}'`, null);
        }
        entry = this.ifd.entries[TIFF.tags[tagName]];
        if (!entry) {
          return null;
        }
        if (entry.count === 1) {
          number = this.readNumber(tagName);
          if (number !== null) {
            return [number];
          }
        }
        numbers = [];
        for (i = j = 0, ref = entry.count; (0 <= ref ? j < ref : j > ref); i = 0 <= ref ? ++j : --j) {
          switch (entry.type) {
            case TIFF.types.SHORT:
              numbers.push(this.readU16(entry.offset + (i * 2)));
              break;
            case TIFF.types.LONG:
              numbers.push(this.readU32(entry.offset + (i * 4)));
              break;
            default:
              this.fail(`readNumbers: can't interpret entry type of ${entry.type}`);
              return null;
          }
        }
        return numbers;
      }

      readBytes(tagName) {
        var entry;
        if (!TIFF.tags[tagName]) {
          return this.fail(`readBytes: no tag named '${tagName}'`, null);
        }
        entry = this.ifd.entries[TIFF.tags[tagName]];
        if (!entry) {
          return null;
        }
        switch (entry.type) {
          case TIFF.types.UNDEFINED:
            return this.raw.slice(entry.offset, entry.offset + entry.count);
        }
        this.fail(`readBytes: can't interpret entry type of ${entry.type}`);
        return null;
      }

    };

    TIFF.tags = {
      ImageWidth: 0x100,
      ImageLength: 0x101,
      BitsPerSample: 0x102,
      Compression: 0x103,
      PhotometricInterpretation: 0x106,
      StripOffsets: 0x111,
      RowsPerStrip: 0x116,
      StripByteCounts: 0x117,
      ExtraSamples: 0x152,
      SampleFormat: 0x153,
      ICCProfile: 0x8773
    };

    TIFF.types = {
      BYTE: 1,
      ASCII: 2,
      SHORT: 3,
      LONG: 4,
      RATIONAL: 5,
      SBYTE: 6,
      UNDEFINED: 7,
      SSHORT: 8,
      SLONG: 9,
      SRATIONAL: 10,
      FLOAT: 11,
      DOUBLE: 12
    };

    TIFF.sampleFormats = {
      UNSIGNED_INT: 1,
      SIGNED_INT: 2,
      FLOAT: 3,
      UNDEFINED: 4
    };

    return TIFF;

  }).call(this);

  module.exports = TIFF;

}).call(this);
