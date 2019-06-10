const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Create Schema
const AntibioticTypeSchema = new Schema({
  name: {
    type: String,
    required: true
  }
});

const AntibioticType = mongoose.model("antibiotic_type", AntibioticTypeSchema);
module.exports = AntibioticType;
