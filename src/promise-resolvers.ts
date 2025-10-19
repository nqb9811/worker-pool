/** Unwrap a Promise with exposed resolve and reject functions. */
export class PromiseResolvers<T = any> {
    public promise: Promise<T>;
    public resolve!: (data: T) => void;
    public reject!: (error: any) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}
