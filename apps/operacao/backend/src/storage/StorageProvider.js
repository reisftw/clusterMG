class StorageProvider {
	constructor(name) {
		this.name = name;
	}

	async createUploadUrl() {
		throw new Error("createUploadUrl não implementado.");
	}

	async createReadUrl() {
		throw new Error("createReadUrl não implementado.");
	}

	async deleteObject() {
		throw new Error("deleteObject não implementado.");
	}

	async headObject() {
		throw new Error("headObject não implementado.");
	}
}

module.exports = { StorageProvider };
