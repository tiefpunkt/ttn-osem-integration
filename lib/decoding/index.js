'use strict';

/**
 * Provides a generic decoding interface into which multiple decoding profiles
 * may be hooked. Implemented profiles are:
 * @see module:decoding/custom
 * @see module:decoding/sensebox_home
 * @module decoding
 */

const transformAndValidateArray = require('openSenseMapAPI/lib/decoding/transformAndValidateArray'),
  profileCustom = require('./custom'),
  profileSenseboxhome = require('./sensebox_home');

const profiles = {
  'custom': profileCustom,
  'sensebox/home': profileSenseboxhome
};

/**
 * Decodes a Buffer to an array of measurements according to a bufferTransformer
 * @private
 * @param {Buffer} buffer - the data to decode
 * @param {Array} bufferTransformer - defines how the data is transformed.
 *        Each element specifies a transformation for one measurement.
 * @example <caption>Interface of bufferTransformer elements</caption>
 * {
 *   bytes: Number,        // amount of bytes to consume for this measurement
 *   sensorId: String,     // corresponding sensor_id for this measurement
 *   transformer: Function // function that accepts an Array of bytes and
 *                         // returns the measurement value
 * }
 * @return {Array} decoded measurements
 */
const bufferToMeasurements = function bufferToMeasurements (buffer, bufferTransformer) {
  const result = [];
  let maskLength = 0, currByte = 0;

  // check mask- & buffer-length
  for (const mask of bufferTransformer) {
    maskLength = maskLength + mask.bytes;
  }

  if (maskLength !== buffer.length) {
    throw new Error(`incorrect amount of bytes, should be ${maskLength}`);
  }

  // feed each bufferTransformer element
  for (const mask of bufferTransformer) {
    const maskedBytes = buffer.slice(currByte, currByte + mask.bytes);

    result.push({
      sensor_id: mask.sensorId,
      value: mask.transformer(maskedBytes)
    });

    currByte = currByte + mask.bytes;
  }

  return result;
};

/**
 * Transforms a buffer to a validated set of measurements according to a boxes
 * TTN configuration.
 * @param {Buffer} buffer - The data to be decoded
 * @param {Box} box - The box on for lookup of TTN config & sensors
 * @return {Promise} Once fulfilled returns a validated array of measurements
 *         (no actual async ops are happening)
 */
const decodeBuffer = function decodeBuffer (buffer, box) {
  return Promise.resolve().then(function () {
    // should never be thrown, as we find a box by it's ttn config
    if (!box.integrations || !box.integrations.ttn || !box.integrations.ttn.decodeOptions) {
      throw new Error('box has no TTN configuration');
    }

    // select bufferTransformer according to profile
    const profile = profiles[box.integrations.ttn.decodeOptions.profile];

    if (!profile) {
      throw new Error(`profile ${box.integrations.ttn.decodeOptions.profile} is not supported`);
    }

    const bufferTransformer = profile.createBufferTransformer(box);

    // decode buffer using bufferTransformer
    const measurements = bufferToMeasurements(buffer, bufferTransformer);

    // validate decoded measurements
    return transformAndValidateArray(measurements);
  });
};

/**
 * proxy for decodeBuffer, which converts the input data from base64 to a buffer first
 * @see decodeBuffer
 * @param {String} base64String
 * @param {Box} box
 * @return {Promise} Once fulfilled returns a validated array of measurements
 *         (no actual async ops are happening)
 */
const decodeBase64 = function decodeBase64 (base64String, box) {
  const buf = Buffer.from(base64String, 'base64');

  return decodeBuffer(buf, box);
};

module.exports = {
  decodeBuffer,
  decodeBase64
};