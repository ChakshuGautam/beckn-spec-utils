const $RefParser = require("@apidevtools/json-schema-ref-parser");
const toJsonSchema = require('@openapi-contrib/openapi-schema-to-json-schema');
const flatten = require('flat');

const allKeys = new Set();

// const specURL = "https://raw.githubusercontent.com/beckn/protocol-specifications/master/core/v0/api/core.yaml";
const specURL = "https://raw.githubusercontent.com/beckn/DSEP-Specification/draft/api/dsep.yaml";

let requiredKeys = {};

function getRequiredKeys(jsonObj, flattenTag) {
    const keys = Object.keys(jsonObj).forEach(key => {
        if (key === 'required') {
            jsonObj[key].forEach((key) => requiredKeys[(flattenTag === ''? flattenTag+key : flattenTag + '.' + key)] = "yes");
        } else if (typeof jsonObj[key] === 'object') {
            getRequiredKeys(jsonObj[key], (flattenTag === ''? flattenTag+key : flattenTag + '.' + key));
        }
    })
}


$RefParser.dereference('./def.yaml', (err, schema) => {
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
            console.log('path: ', path);
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
                            // require("fs").writeFileSync(`flatten-json-schema-${path.substring(1)}.json`, JSON.stringify(flatJsonSchema, null, 2));
                            Object.keys(flatJsonSchema).forEach(key => {
                                // deleting not required keys
                                if(key == "type" || key.includes('$schema')) {
                                    delete flatJsonSchema[key];
                                    return;
                                }
                                if (key.includes("format") && (flatJsonSchema[key].includes("#/components/schemas/Item/properties/id") || flatJsonSchema[key].includes("phone"))) {
                                    flatJsonSchema[key] = "uuid";
                                }
                                // replacing the key with term 'properties' from schema after removing
                                let newKey = null;
                                if(key.includes('properties')) newKey = key.split('.').filter((val) => val !== 'properties').join('.') ;
                                if(newKey && newKey.includes('message')) newKey = newKey.split('.').filter((val) => val !== 'message').join('.') ;
                                if(newKey === "type") {
                                    delete flatJsonSchema[key];
                                    return;
                                }
                                if(newKey) {
                                    flatJsonSchema[newKey] = flatJsonSchema[key] ;
                                    delete flatJsonSchema[key];
                                }
                            });
                            const jsonSchema = flatten.unflatten(flatJsonSchema);
                            // require("fs").writeFileSync(`json-schema-${path.substring(1)}.json`, JSON.stringify(jsonSchema, null, 2));

                            try {
                                // writing json spec for the path to file
                                require("fs").writeFileSync(`./spec/${path.substring(1)}-schema.json`, JSON.stringify(jsonSchema, null, 2));

                                getRequiredKeys(jsonSchema,'');
                                require("fs").writeFileSync(`./spec/${path.substring(1)}-required-keys.json`, JSON.stringify(requiredKeys, null, 2));
                                const jsonSchemaString = JSON.stringify(jsonSchema, null, 2);

                                // flatten json data to dot notation
                                const jsonFlattened = flatten(jsonSchema);
                                // get keys for flattened json
                                let keys = Object.keys(jsonFlattened);
                                // remove keys not part of the schema
                                let reqKeys = [];
                                const unflatIntermediateJson = flatten.unflatten(jsonFlattened);
                                //removing keys with required in them
                                keys = keys.filter((key) => {
                                    if(key.includes('required')) {
                                        delete jsonFlattened[key];
                                        return false;
                                    }
                                    return true ;
                                })

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
                                

                                require("fs").writeFileSync(`./spec/${path.substring(1)}-keys.csv`, filteredKeysWithNumbers.map((item) => [item.split('.')[0], item, (requiredKeys[item] ? requiredKeys[item] : "no")]).join("\n"));   
                                Object.keys(requiredKeys).map(key => allKeys.add(key));
                                // filteredKeysWithNumbers.push(...Object.keys(requiredKeys)).sort();                             
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
        require("fs").writeFileSync(`all-required-keys.json`, JSON.stringify(requiredKeys, null, 2));
        // save all keys to new file csv format
        require("fs").writeFileSync(`keys-${Date.now()}.csv`, Array.from(allKeys).map((item) => [item.split('.')[0], item, (requiredKeys[item] ? requiredKeys[item] : "no")]).join("\n"));
    }
});
