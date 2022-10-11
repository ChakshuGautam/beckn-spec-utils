const $RefParser = require("@apidevtools/json-schema-ref-parser");
const toJsonSchema = require('@openapi-contrib/openapi-schema-to-json-schema');
const jsf = require('json-schema-faker');
const flatten = require('flat');

const allKeys = new Set();

// const specURL = "https://raw.githubusercontent.com/beckn/protocol-specifications/master/core/v0/api/core.yaml";
const specURL = "https://raw.githubusercontent.com/beckn/DSEP-Specification/draft/api/dsep.yaml";

$RefParser.dereference(specURL, (err, schema) => {
    if (err) {
        console.error(err);
    }
    else {
        // save to file
        require("fs").writeFileSync("schema-deref.json", JSON.stringify(schema, null, 2));

        // finde paths
        const paths = Object.keys(schema.paths);

        // Iterate over paths and get all schemas
        paths.forEach(path => {
            const methods = Object.keys(schema.paths[path]);
            methods.forEach(method => {
                const operation = schema.paths[path][method];
                if (operation.requestBody) {
                    const requestBody = operation.requestBody;
                    if (requestBody.content) {
                        const content = requestBody.content;
                        const mediaTypes = Object.keys(content);
                        mediaTypes.forEach(mediaType => {
                            const schema = content[mediaType].schema;
                            const jsonSchemaWithErrors = toJsonSchema(schema, { dateToDateTime: true });

                            // remove keys of "format" with "#" in them
                            const flatJsonSchema = flatten(jsonSchemaWithErrors);
                            Object.keys(flatJsonSchema).forEach(key => {
                                if (key.includes("format") && (flatJsonSchema[key].includes("#/components/schemas/Item/properties/id") || flatJsonSchema[key].includes("phone"))) {
                                    flatJsonSchema[key] = "uuid";
                                }
                            });
                            const jsonSchema = flatten.unflatten(flatJsonSchema);
                            try {
                                const jsonSchemaString = JSON.stringify(jsonSchema, null, 2);
                                const fakeData = jsf.generate(jsonSchema);

                                // flatten json data to dot notation
                                const flattened = flatten(fakeData);

                                // get keys for flattened json
                                const keys = Object.keys(flattened);

                                // remove keys not part of the schema
                                const filteredKeys = keys.filter(key => {
                                    // split key into parts and get last part
                                    const parts = key.split('.');
                                    const lastPart = parts[parts.length - 1];
                                    return jsonSchemaString.includes(lastPart);
                                });

                                // change ones with numbers as the any part to "[i]"
                                const filteredKeysWithNumbers = filteredKeys.map(key => {
                                    const parts = key.split('.');
                                    const newParts = parts.map(part => {
                                        if (part.match(/^[0-9]+$/)) {
                                            return '[i]';
                                        }
                                        return part;
                                    });
                                    return newParts.join('.');
                                });

                                filteredKeysWithNumbers.forEach(item => allKeys.add(item))
                            } catch (e) {
                                console.error(e);
                                console.error(path);
                                // save to file
                                require("fs").writeFileSync("error-schema.json", JSON.stringify(jsonSchemaWithErrors, null, 2));
                            }

                        });
                    }
                }
            });
        });


        // save all keys to new file csv format
        require("fs").writeFileSync("keys.csv", Array.from(allKeys).join("\n"));
    }
});